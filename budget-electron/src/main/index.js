import { app, BrowserWindow, ipcMain, safeStorage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'
import fs from 'fs'
import XLSX from 'xlsx'
import { PlaidApi, PlaidEnvironments, Configuration, Products, CountryCode } from 'plaid'
import Anthropic from '@anthropic-ai/sdk'
import { debug } from 'console'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

// ---------------------------------------------------------------------------
// Database setup
// ---------------------------------------------------------------------------
let db
let currentProfileId = null  // in-memory session — resets on every app launch

// ---------------------------------------------------------------------------
// Plaid client
// ---------------------------------------------------------------------------
const plaidClient = new PlaidApi(new Configuration({
  basePath: PlaidEnvironments[import.meta.env.MAIN_VITE_PLAID_ENV || 'sandbox'],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': import.meta.env.MAIN_VITE_PLAID_CLIENT_ID || '',
      'PLAID-SECRET':    import.meta.env.MAIN_VITE_PLAID_SECRET    || ''
    }
  }
}))

// ---------------------------------------------------------------------------
// Anthropic client
// ---------------------------------------------------------------------------
const anthropic = new Anthropic({
  apiKey: import.meta.env.MAIN_VITE_ANTHROPIC_API_KEY || ''
})

function initDb() {
  const dbPath = join(app.getPath('userData'), 'budget.db')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')

  // Create all tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      name TEXT,
      password_hash TEXT NOT NULL,
      is_hidden INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('in', 'out')),
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      amount REAL NOT NULL,
      category TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS expectations (
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      category TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('in', 'out')),
      amount REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (year, month, category, type)
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS plaid_items (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id       INTEGER NOT NULL REFERENCES profiles(id),
      item_id          TEXT NOT NULL UNIQUE,
      access_token     TEXT NOT NULL,
      institution_id   TEXT,
      institution_name TEXT,
      cursor           TEXT,
      created_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)

  // Seed default categories config if not yet stored
  const hasDC = db.prepare("SELECT 1 FROM app_settings WHERE key='default_categories'").get()
  if (!hasDC) {
    db.prepare("INSERT INTO app_settings (key, value) VALUES ('default_categories', ?)")
      .run(JSON.stringify({
        in:  ['Paychecks', 'Misc'],
        out: ['Rent', 'Groceries', 'Car', 'Credit Card', 'Subscriptions', 'Dining', 'Recreational', 'Misc']
      }))
  }

  // Column migrations — safe to run every launch (ignores if already exists)
  for (const table of ['categories', 'transactions', 'expectations']) {
    try { db.exec(`ALTER TABLE ${table} ADD COLUMN profile_id INTEGER REFERENCES profiles(id)`) }
    catch (e) { /* already exists */ }
  }
  try { db.exec('ALTER TABLE transactions ADD COLUMN plaid_transaction_id TEXT') } catch (e) {}
  try { db.exec('ALTER TABLE profiles ADD COLUMN auto_sync INTEGER NOT NULL DEFAULT 0') } catch (e) {}
  try { db.exec('ALTER TABLE plaid_items ADD COLUMN token_encrypted INTEGER NOT NULL DEFAULT 0') } catch (e) {}
  try { db.exec('ALTER TABLE plaid_items ADD COLUMN start_date TEXT') } catch (e) {}

  // Seed Excel-Test profile and backfill orphaned rows (when profiles is empty but data exists)
  const profileCount = db.prepare('SELECT COUNT(*) as c FROM profiles').get().c
  const catCount     = db.prepare('SELECT COUNT(*) as c FROM categories').get().c
  const txCount      = db.prepare('SELECT COUNT(*) as c FROM transactions').get().c

  if (profileCount === 0 && (catCount > 0 || txCount > 0)) {
    const hash = bcrypt.hashSync('1234', 10)
    db.prepare('INSERT OR IGNORE INTO profiles (username, name, password_hash, is_hidden) VALUES (?,?,?,?)')
      .run('Excel-Test', null, hash, 0)
    const { id } = db.prepare('SELECT id FROM profiles WHERE username=?').get('Excel-Test')
    for (const table of ['categories', 'transactions', 'expectations']) {
      db.prepare(`UPDATE ${table} SET profile_id=? WHERE profile_id IS NULL`).run(id)
    }
    console.log('Seeded Excel-Test profile and migrated existing data')
  }

  // First-ever launch with no data: attempt Excel migration
  if (profileCount === 0 && catCount === 0 && txCount === 0) {
    const hash = bcrypt.hashSync('1234', 10)
    db.prepare('INSERT OR IGNORE INTO profiles (username, name, password_hash, is_hidden) VALUES (?,?,?,?)')
      .run('Excel-Test', null, hash, 0)
    const row = db.prepare('SELECT id FROM profiles WHERE username=?').get('Excel-Test')
    migrateFromExcel(row.id)
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Parse "yyyy-MM-dd" in local time to avoid UTC midnight timezone shift
function parseLocalDate(str) {
  if (!str) return new Date(NaN)
  const s = String(str)
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return new Date(s)
}

// Batch-categorize uncategorized transactions for a profile using Claude API
async function categorizeWithClaude(profileId) {
  if (!import.meta.env.MAIN_VITE_ANTHROPIC_API_KEY) return

  const uncategorized = db.prepare(
    `SELECT id, description, amount FROM transactions
     WHERE profile_id=? AND (category IS NULL OR category='')
     ORDER BY date DESC`
  ).all(profileId)
  if (!uncategorized.length) return

  const cats = db.prepare('SELECT name, type FROM categories WHERE profile_id=?').all(profileId)
  const categoriesIn  = cats.filter(r => r.type === 'in').map(r => r.name)
  const categoriesOut = cats.filter(r => r.type === 'out').map(r => r.name)
  if (!categoriesIn.length && !categoriesOut.length) return

  const txList = uncategorized.map(tx => ({
    id: tx.id,
    description: tx.description || '',
    type: tx.amount >= 0 ? 'income' : 'expense'
  }))

  const prompt = `Income categories: ${categoriesIn.join(', ') || '(none)'}
Expense categories: ${categoriesOut.join(', ') || '(none)'}

Categorize each transaction using ONLY the category list that matches its type field.
- If type is "income": choose from income categories ONLY
- If type is "expense": choose from expense categories ONLY

Transactions:
${JSON.stringify(txList, null, 2)}

Respond with ONLY a JSON array, no other text:
[{"id": <number>, "category": "<category name>"}, ...]`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }]
    })
    const raw = response.content[0]?.text?.trim() || ''
    const match = raw.match(/\[[\s\S]*\]/)
    if (!match) return
    const assignments = JSON.parse(match[0])
    const update = db.prepare('UPDATE transactions SET category=? WHERE id=? AND profile_id=?')
    db.transaction(() => {
      for (const { id, category } of assignments) {
        if (id && category) update.run(category, id, profileId)
      }
    })()
  } catch (e) {
    console.error('Claude categorization failed:', e.message)
  }
}

// Cursor-based transaction sync for one Plaid item
async function syncPlaidItem(itemRow) {
  let cursor = itemRow.cursor || null
  let added = [], modified = [], removed = [], hasMore = true

  while (hasMore) {
    const requestBody = { access_token: getAccessToken(itemRow) }
    if (cursor) {
      requestBody.cursor = cursor
    } else if (itemRow.start_date) {
      const daysDiff = Math.floor((Date.now() - new Date(itemRow.start_date).getTime()) / 86400000)
      requestBody.options = { days_requested: Math.min(Math.max(daysDiff, 1), 730) }
      debug.log(requestBody.days_requested)
    }
    const res = await plaidClient.transactionsSync(requestBody)
    added    = [...added,    ...res.data.added]
    modified = [...modified, ...res.data.modified]
    removed  = [...removed,  ...res.data.removed]
    cursor   = res.data.next_cursor
    hasMore  = res.data.has_more
  }

  db.transaction(() => {
    for (const tx of removed) {
      db.prepare('DELETE FROM transactions WHERE plaid_transaction_id=? AND profile_id=?')
        .run(tx.transaction_id, itemRow.profile_id)
    }
    for (const tx of [...added, ...modified]) {
      // Plaid positive = expense → negative in our app; negative = income → positive
      const amount = -(tx.amount)
      const date   = tx.date  // Plaid already returns "yyyy-MM-dd"
      const desc   = tx.merchant_name || tx.name || ''

      let existing = db.prepare('SELECT id FROM transactions WHERE plaid_transaction_id=? AND profile_id=?')
        .get(tx.transaction_id, itemRow.profile_id)

      if (existing) {
        db.prepare('UPDATE transactions SET date=?,amount=?,description=? WHERE id=?')
          .run(date, amount, desc, existing.id)
      } else {
        // Secondary dedup: match an existing row by (date, amount, description) so that
        // manual entries and re-syncs after cursor reset don't create duplicates
        const dupe = db.prepare(
          "SELECT id FROM transactions WHERE profile_id=? AND date=? AND amount=? AND description=? AND (plaid_transaction_id IS NULL OR plaid_transaction_id='')"
        ).get(itemRow.profile_id, date, amount, desc)

        if (dupe) {
          // Link the manual entry to this Plaid transaction (no new row)
          db.prepare('UPDATE transactions SET plaid_transaction_id=? WHERE id=?')
            .run(tx.transaction_id, dupe.id)
        } else {
          db.prepare('INSERT INTO transactions (date,amount,category,description,profile_id,plaid_transaction_id) VALUES (?,?,?,?,?,?)')
            .run(date, amount, '', desc, itemRow.profile_id, tx.transaction_id)
        }
      }
    }
    db.prepare('UPDATE plaid_items SET cursor=? WHERE id=?').run(cursor, itemRow.id)
  })()

  // If this was the very first sync and Plaid returned nothing (sandbox timing lag),
  // reset cursor so the next manual sync retries from the beginning
  if (!itemRow.cursor && added.length === 0 && modified.length === 0) {
    db.prepare('UPDATE plaid_items SET cursor=NULL WHERE id=?').run(itemRow.id)
  }

  await categorizeWithClaude(itemRow.profile_id)
  return { added: added.length, modified: modified.length, removed: removed.length }
}

// One-time migration from Tracker.xlsx + json-dump.json
// ---------------------------------------------------------------------------
// safeStorage helpers for Plaid access tokens
// ---------------------------------------------------------------------------
function encryptToken(plaintext) {
  if (safeStorage.isEncryptionAvailable()) {
    return { value: safeStorage.encryptString(plaintext).toString('base64'), encrypted: 1 }
  }
  return { value: plaintext, encrypted: 0 }
}

function getAccessToken(item) {
  if (item.token_encrypted) {
    return safeStorage.decryptString(Buffer.from(item.access_token, 'base64'))
  }
  return item.access_token
}

// Encrypt any plaintext tokens left over from before this feature was added
function migrateTokenEncryption() {
  if (!safeStorage.isEncryptionAvailable()) return
  const items = db.prepare('SELECT id, access_token FROM plaid_items WHERE token_encrypted=0').all()
  for (const item of items) {
    if (!item.access_token) continue
    const encrypted = safeStorage.encryptString(item.access_token).toString('base64')
    db.prepare('UPDATE plaid_items SET access_token=?, token_encrypted=1 WHERE id=?').run(encrypted, item.id)
  }
}

function migrateFromExcel(profileId) {
  const xlsxCandidates = [
    join(app.getAppPath(), '..', 'Tracker.xlsx'),
    join(app.getAppPath(), '..', '..', 'Tracker.xlsx')
  ]
  let xlsxPath = null
  for (const c of xlsxCandidates) {
    if (fs.existsSync(c)) { xlsxPath = c; break }
  }

  const jsonCandidates = xlsxPath
    ? [join(xlsxPath, '..', 'json-dump.json')]
    : [join(app.getAppPath(), '..', 'json-dump.json')]

  for (const jc of jsonCandidates) {
    if (fs.existsSync(jc)) {
      try {
        const data = JSON.parse(fs.readFileSync(jc, 'utf-8'))
        const insertCat = db.prepare('INSERT INTO categories (name, type, sort_order, profile_id) VALUES (?, ?, ?, ?)')
        db.transaction(() => {
          ;(data['Categories In'] || []).forEach((name, i) => insertCat.run(name, 'in', i, profileId))
          ;(data['Categories Out'] || []).forEach((name, i) => insertCat.run(name, 'out', i, profileId))
        })()
        console.log('Migrated categories from json-dump.json')
      } catch (e) {
        console.error('Category migration failed:', e)
      }
      break
    }
  }

  if (!xlsxPath) return

  try {
    const wb = XLSX.readFile(xlsxPath, { cellDates: true, dense: false })

    if (wb.SheetNames.includes('Log')) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets['Log'], { raw: false, defval: '' })
      const insertTx = db.prepare('INSERT INTO transactions (date, amount, category, description, profile_id) VALUES (?, ?, ?, ?, ?)')
      db.transaction(() => {
        rows.forEach(row => {
          insertTx.run(row.Date || '', parseFloat(row.Amount) || 0, row.Category || '', row.Description || '', profileId)
        })
      })()
      console.log(`Migrated ${rows.length} transactions from Tracker.xlsx`)
    }

    const insertExp = db.prepare('INSERT OR REPLACE INTO expectations (year, month, category, type, amount, profile_id) VALUES (?, ?, ?, ?, ?, ?)')
    db.transaction(() => {
      wb.SheetNames.filter(s => /^\d{4}$/.test(s)).forEach(yearStr => {
        const year = Number(yearStr)
        const aoa = XLSX.utils.sheet_to_json(wb.Sheets[yearStr], { header: 1, defval: '' })
        let inSection = false, outSection = false
        for (const row of aoa) {
          const label = String(row[0])
          if (label === 'Input') { inSection = true; outSection = false; continue }
          if (label === 'Output') { inSection = false; outSection = true; continue }
          if (label === 'Total' || label === 'Overall Total' || label === '') continue
          for (let m = 0; m < 12; m++) {
            const val = parseFloat(row[m * 2 + 1]) || 0
            if (val === 0) continue
            if (inSection) insertExp.run(year, m, label, 'in', val, profileId)
            if (outSection) insertExp.run(year, m, label, 'out', val, profileId)
          }
        }
      })
    })()
    console.log('Migrated expectations from Tracker.xlsx')
  } catch (e) {
    console.error('Excel migration failed:', e)
  }
}

// ---------------------------------------------------------------------------
// IPC Handlers — Auth
// ---------------------------------------------------------------------------
ipcMain.handle('auth:get-profiles', () => {
  return db.prepare('SELECT id, username, name FROM profiles WHERE is_hidden=0 ORDER BY created_at ASC').all()
})

ipcMain.handle('auth:login', (_e, { username, password }) => {
  const profile = db.prepare('SELECT * FROM profiles WHERE username=?').get(username)
  if (!profile) return { ok: false, error: 'Invalid credentials' }
  const valid = bcrypt.compareSync(password, profile.password_hash)
  if (!valid) return { ok: false, error: 'Invalid credentials' }
  currentProfileId = profile.id

  // Fire-and-forget auto-sync if enabled
  if (profile.auto_sync) {
    ;(async () => {
      const items = db.prepare('SELECT * FROM plaid_items WHERE profile_id=?').all(profile.id)
      for (const item of items) { try { await syncPlaidItem(item) } catch (e) { console.error('Auto-sync error:', e) } }
      BrowserWindow.getAllWindows()[0]?.webContents.send('plaid:sync-complete')
    })()
  }

  return { ok: true, profile: { id: profile.id, username: profile.username, name: profile.name } }
})

ipcMain.handle('auth:logout', () => {
  currentProfileId = null
  return true
})

ipcMain.handle('auth:create-profile', (_e, { username, name, password, isHidden }) => {
  const existing = db.prepare('SELECT id FROM profiles WHERE username=?').get(username.trim())
  if (existing) return { ok: false, error: 'Username already taken' }
  const hash = bcrypt.hashSync(password, 10)
  const { lastInsertRowid } = db.prepare('INSERT INTO profiles (username, name, password_hash, is_hidden) VALUES (?,?,?,?)')
    .run(username.trim(), name?.trim() || null, hash, isHidden ? 1 : 0)
  const row = db.prepare("SELECT value FROM app_settings WHERE key='default_categories'").get()
  const defaults = row ? JSON.parse(row.value) : { in: [], out: [] }
  const insertCat = db.prepare('INSERT INTO categories (name, type, sort_order, profile_id) VALUES (?,?,?,?)')
  db.transaction(() => {
    ;(defaults.in  || []).forEach((n, i) => insertCat.run(n, 'in',  i, lastInsertRowid))
    ;(defaults.out || []).forEach((n, i) => insertCat.run(n, 'out', i, lastInsertRowid))
  })()
  return { ok: true }
})

ipcMain.handle('auth:get-current-profile', () => {
  if (!currentProfileId) return null
  const p = db.prepare('SELECT id, username, name FROM profiles WHERE id=?').get(currentProfileId)
  return p || null
})

ipcMain.handle('auth:delete-account', () => {
  if (!currentProfileId) return { ok: false, error: 'Not logged in' }
  db.transaction(() => {
    db.prepare('DELETE FROM transactions WHERE profile_id=?').run(currentProfileId)
    db.prepare('DELETE FROM categories WHERE profile_id=?').run(currentProfileId)
    db.prepare('DELETE FROM expectations WHERE profile_id=?').run(currentProfileId)
    db.prepare('DELETE FROM plaid_items WHERE profile_id=?').run(currentProfileId)
    db.prepare('DELETE FROM profiles WHERE id=?').run(currentProfileId)
  })()
  currentProfileId = null
  return { ok: true }
})

// ---------------------------------------------------------------------------
// IPC Handlers — App Settings
// ---------------------------------------------------------------------------
ipcMain.handle('settings:get-default-categories', () => {
  const row = db.prepare("SELECT value FROM app_settings WHERE key='default_categories'").get()
  return row ? JSON.parse(row.value) : { in: [], out: [] }
})

ipcMain.handle('settings:save-default-categories', (_e, { in: inCats, out: outCats }) => {
  db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('default_categories', ?)")
    .run(JSON.stringify({ in: inCats, out: outCats }))
  return true
})

// ---------------------------------------------------------------------------
// IPC Handlers — Plaid
// ---------------------------------------------------------------------------
ipcMain.handle('plaid:get-items', () => {
  return db.prepare('SELECT id, institution_name, institution_id, created_at, start_date FROM plaid_items WHERE profile_id=? ORDER BY created_at ASC')
    .all(currentProfileId)
})

ipcMain.handle('plaid:open-link', async () => {
  try {
    const ltRes = await plaidClient.linkTokenCreate({
      user: { client_user_id: String(currentProfileId) },
      client_name: 'Budget Tracker',
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: 'en'
    })
    const linkToken = ltRes.data.link_token

    return new Promise((resolve) => {
      const htmlPath = is.dev
        ? join(app.getAppPath(), 'resources', 'plaid-link.html')
        : join(process.resourcesPath, 'plaid-link.html')

      const popup = new BrowserWindow({
        width: 500,
        height: 700,
        webPreferences: {
          preload: join(__dirname, '../preload/plaid-preload.js'),
          contextIsolation: true,
          nodeIntegration: false,
          webSecurity: false
        }
      })
      popup.loadFile(htmlPath, { query: { link_token: linkToken } })
      popup.setMenuBarVisibility(false)

      let resolved = false

      ipcMain.once('plaid:popup-result', async (_e, result) => {
        resolved = true
        if (!popup.isDestroyed()) popup.close()
        if (!result.success) return resolve({ ok: false })
        try {
          const exRes = await plaidClient.itemPublicTokenExchange({ public_token: result.publicToken })
          const accessToken = exRes.data.access_token
          const itemId      = exRes.data.item_id
          const instName    = result.metadata?.institution?.name || 'Unknown Bank'
          const instId      = result.metadata?.institution?.institution_id || null

          const { value: tokenValue, encrypted: tokenEncrypted } = encryptToken(accessToken)
          const { lastInsertRowid } = db.prepare(
            'INSERT INTO plaid_items (profile_id,item_id,access_token,token_encrypted,institution_id,institution_name) VALUES (?,?,?,?,?,?)'
          ).run(currentProfileId, itemId, tokenValue, tokenEncrypted, instId, instName)
          // Do not auto-sync — return newItemId so the UI can show the date picker first
          resolve({ ok: true, newItemId: lastInsertRowid, institution: instName })
        } catch (e) {
          resolve({ ok: false, error: e.message })
        }
      })

      popup.on('closed', () => {
        if (!resolved) resolve({ ok: false })
      })
    })
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('plaid:remove-item', async (_e, { id }) => {
  const item = db.prepare('SELECT * FROM plaid_items WHERE id=? AND profile_id=?').get(id, currentProfileId)
  if (!item) return { ok: false }
  try { await plaidClient.itemRemove({ access_token: getAccessToken(item) }) } catch (e) { /* ignore — still delete locally */ }
  db.prepare('DELETE FROM plaid_items WHERE id=?').run(id)
  return { ok: true }
})

ipcMain.handle('plaid:sync', async (_e, { id }) => {
  let item = db.prepare('SELECT * FROM plaid_items WHERE id=? AND profile_id=?').get(id, currentProfileId)
  if (!item) return { ok: false }

  // If all plaid-imported transactions for this profile have been deleted,
  // reset all cursors so the next sync re-imports full history
  const plaidTxCount = db.prepare(
    "SELECT COUNT(*) as cnt FROM transactions WHERE profile_id=? AND plaid_transaction_id IS NOT NULL AND plaid_transaction_id!=''"
  ).get(currentProfileId)
  if (plaidTxCount.cnt === 0) {
    db.prepare('UPDATE plaid_items SET cursor=NULL WHERE profile_id=?').run(currentProfileId)
    item = db.prepare('SELECT * FROM plaid_items WHERE id=?').get(id)
  }

  try {
    const stats = await syncPlaidItem(item)
    return { ok: true, ...stats }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('plaid:set-lookback', async (_e, { id, start_date }) => {
  const item = db.prepare('SELECT * FROM plaid_items WHERE id=? AND profile_id=?').get(id, currentProfileId)
  if (!item) return { ok: false }
  db.prepare('UPDATE plaid_items SET start_date=?, cursor=NULL WHERE id=?').run(start_date, id)
  const updatedItem = db.prepare('SELECT * FROM plaid_items WHERE id=?').get(id)
  try {
    const stats = await syncPlaidItem(updatedItem)
    return { ok: true, ...stats }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('plaid:get-auto-sync', () => {
  const p = db.prepare('SELECT auto_sync FROM profiles WHERE id=?').get(currentProfileId)
  return !!p?.auto_sync
})

ipcMain.handle('plaid:set-auto-sync', async (_e, { enabled }) => {
  db.prepare('UPDATE profiles SET auto_sync=? WHERE id=?').run(enabled ? 1 : 0, currentProfileId)
  if (enabled) {
    const items = db.prepare('SELECT * FROM plaid_items WHERE profile_id=?').all(currentProfileId)
    for (const item of items) { try { await syncPlaidItem(item) } catch (e) { console.error('Sync error:', e) } }
    BrowserWindow.getAllWindows()[0]?.webContents.send('plaid:sync-complete')
  }
  return { ok: true }
})

// ---------------------------------------------------------------------------
// IPC Handlers — Categories
// ---------------------------------------------------------------------------
ipcMain.handle('db:get-categories', () => {
  const rows = db.prepare('SELECT name, type FROM categories WHERE profile_id=? ORDER BY type, sort_order, name').all(currentProfileId)
  return {
    categoriesIn: rows.filter(r => r.type === 'in').map(r => r.name),
    categoriesOut: rows.filter(r => r.type === 'out').map(r => r.name)
  }
})

ipcMain.handle('db:save-categories', (_e, { categoriesIn, categoriesOut }) => {
  db.transaction(() => {
    db.prepare('DELETE FROM categories WHERE profile_id=?').run(currentProfileId)
    const insert = db.prepare('INSERT INTO categories (name, type, sort_order, profile_id) VALUES (?, ?, ?, ?)')
    categoriesIn.forEach((name, i) => insert.run(name, 'in', i, currentProfileId))
    categoriesOut.forEach((name, i) => insert.run(name, 'out', i, currentProfileId))
  })()
  return true
})

// ---------------------------------------------------------------------------
// IPC Handlers — Transactions
// ---------------------------------------------------------------------------
ipcMain.handle('db:get-transactions', () => {
  const rows = db.prepare('SELECT id, date, amount, category, description FROM transactions WHERE profile_id=? ORDER BY date DESC, id DESC').all(currentProfileId)
  return rows.map(r => ({ id: r.id, Date: r.date, Amount: r.amount, Category: r.category, Description: r.description }))
})

ipcMain.handle('db:add-transaction', (_e, { date, amount, category, description }) => {
  db.prepare('INSERT INTO transactions (date, amount, category, description, profile_id) VALUES (?, ?, ?, ?, ?)').run(date, amount, category, description || '', currentProfileId)
  return true
})

ipcMain.handle('db:edit-transaction', (_e, { id, date, amount, category, description }) => {
  db.prepare('UPDATE transactions SET date=?, amount=?, category=?, description=? WHERE id=? AND profile_id=?').run(date, amount, category, description || '', id, currentProfileId)
  return true
})

ipcMain.handle('db:delete-transaction', (_e, { id }) => {
  db.prepare('DELETE FROM transactions WHERE id=? AND profile_id=?').run(id, currentProfileId)
  return true
})

// ---------------------------------------------------------------------------
// IPC Handlers — Year Chart
// ---------------------------------------------------------------------------
ipcMain.handle('db:get-year-chart', (_e, { year, categoriesIn, categoriesOut }) => {
  const expectedIn = {}
  const expectedOut = {}
  categoriesIn.forEach(c => { expectedIn[c] = {}; for (let m = 0; m < 12; m++) expectedIn[c][m] = 0 })
  categoriesOut.forEach(c => { expectedOut[c] = {}; for (let m = 0; m < 12; m++) expectedOut[c][m] = 0 })

  db.prepare('SELECT month, category, type, amount FROM expectations WHERE year=? AND profile_id=?').all(year, currentProfileId).forEach(r => {
    if (r.type === 'in' && expectedIn[r.category] !== undefined) expectedIn[r.category][r.month] = r.amount
    if (r.type === 'out' && expectedOut[r.category] !== undefined) expectedOut[r.category][r.month] = r.amount
  })

  const actualIn = {}
  const actualOut = {}
  categoriesIn.forEach(c => { actualIn[c] = {}; for (let m = 0; m < 12; m++) actualIn[c][m] = 0 })
  categoriesOut.forEach(c => { actualOut[c] = {}; for (let m = 0; m < 12; m++) actualOut[c][m] = 0 })

  const yearStart = `${year}-01-01`
  const yearEnd = `${year}-12-31`
  db.prepare('SELECT date, amount, category FROM transactions WHERE date >= ? AND date <= ? AND profile_id=?').all(yearStart, yearEnd, currentProfileId).forEach(row => {
    const d = parseLocalDate(row.date)
    if (isNaN(d.getTime())) return
    const month = d.getMonth()
    if (row.amount >= 0 && actualIn[row.category] !== undefined) actualIn[row.category][month] += row.amount
    if (row.amount < 0 && actualOut[row.category] !== undefined) actualOut[row.category][month] += row.amount
  })

  const allTx = db.prepare('SELECT date, amount FROM transactions WHERE profile_id=? ORDER BY date ASC').all(currentProfileId)
  const cumulativeByMonth = Array.from({ length: 12 }, (_, m) => {
    const lastDay = new Date(year, m + 1, 0)
    const cutoff = `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`
    let total = 0
    allTx.forEach(row => { if (row.date <= cutoff) total += row.amount })
    return total
  })

  return { expectedIn, expectedOut, actualIn, actualOut, cumulativeByMonth, months: MONTHS, categoriesIn, categoriesOut }
})

// ---------------------------------------------------------------------------
// IPC Handlers — Expectations
// ---------------------------------------------------------------------------
ipcMain.handle('db:get-expectations', (_e, { year, categoriesIn, categoriesOut }) => {
  const expectedIn = {}
  const expectedOut = {}
  categoriesIn.forEach(c => { expectedIn[c] = {}; for (let m = 0; m < 12; m++) expectedIn[c][m] = 0 })
  categoriesOut.forEach(c => { expectedOut[c] = {}; for (let m = 0; m < 12; m++) expectedOut[c][m] = 0 })

  db.prepare('SELECT month, category, type, amount FROM expectations WHERE year=? AND profile_id=?').all(year, currentProfileId).forEach(r => {
    if (r.type === 'in' && expectedIn[r.category] !== undefined) expectedIn[r.category][r.month] = r.amount
    if (r.type === 'out' && expectedOut[r.category] !== undefined) expectedOut[r.category][r.month] = r.amount
  })
  return { expectedIn, expectedOut }
})

ipcMain.handle('db:save-expectations', (_e, { year, expectationsIn, expectationsOut }) => {
  const upsert = db.prepare('INSERT OR REPLACE INTO expectations (year, month, category, type, amount, profile_id) VALUES (?, ?, ?, ?, ?, ?)')
  db.transaction(() => {
    Object.entries(expectationsIn).forEach(([cat, months]) => {
      Object.entries(months).forEach(([month, amount]) => upsert.run(year, Number(month), cat, 'in', amount ?? 0, currentProfileId))
    })
    Object.entries(expectationsOut).forEach(([cat, months]) => {
      Object.entries(months).forEach(([month, amount]) => upsert.run(year, Number(month), cat, 'out', amount ?? 0, currentProfileId))
    })
  })()
  return true
})

ipcMain.handle('db:get-years', () => {
  return db.prepare("SELECT DISTINCT CAST(substr(date, 1, 4) AS INTEGER) as year FROM transactions WHERE profile_id=? ORDER BY year").all(currentProfileId).map(r => r.year)
})

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------
function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    },
    title: 'Budget Tracker'
  })

  win.on('ready-to-show', () => win.show())

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.budget.tracker')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))
  initDb()
  migrateTokenEncryption()
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
