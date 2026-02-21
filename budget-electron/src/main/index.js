import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join, resolve } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import XLSX from 'xlsx'
import fs from 'fs'

// ---------------------------------------------------------------------------
// Excel file resolution
// ---------------------------------------------------------------------------
const DEFAULT_TRACKER = resolve(app.getAppPath(), '..', 'Tracker.xlsx')
let trackerPath = DEFAULT_TRACKER

function getTrackerPath() {
  if (fs.existsSync(trackerPath)) return trackerPath
  // Walk up from app dir looking for Tracker.xlsx
  const candidates = [
    resolve(app.getAppPath(), '..', 'Tracker.xlsx'),
    resolve(app.getAppPath(), '..', '..', 'Tracker.xlsx')
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) { trackerPath = c; return c }
  }
  return null
}

function loadWorkbook() {
  const p = getTrackerPath()
  if (!p) return null
  return XLSX.readFile(p, { cellDates: true, dense: false })
}

function saveWorkbook(wb) {
  XLSX.writeFile(wb, trackerPath)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

function ensureLogSheet(wb) {
  if (!wb.SheetNames.includes('Log')) {
    const ws = XLSX.utils.aoa_to_sheet([['Date','Amount','Category','Description']])
    XLSX.utils.book_append_sheet(wb, ws, 'Log')
  }
}

function sheetToObjects(ws) {
  return XLSX.utils.sheet_to_json(ws, { raw: false, defval: '' })
}

// Parse "yyyy-MM-dd" date strings in LOCAL time to avoid UTC-midnight timezone shift.
// new Date("2024-01-15") treats input as UTC and shifts the date back in negative-offset zones.
function parseLocalDate(str) {
  if (!str) return new Date(NaN)
  const s = String(str)
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return new Date(s)
}

function sortLogSheet(ws) {
  const rows = sheetToObjects(ws)
  rows.sort((a, b) => parseLocalDate(b.Date) - parseLocalDate(a.Date))
  const header = [['Date','Amount','Category','Description']]
  const dataRows = rows.map(r => [r.Date, parseFloat(r.Amount) || 0, r.Category, r.Description])
  return XLSX.utils.aoa_to_sheet([...header, ...dataRows])
}

// Build year sheet structure (mirrors year_chart.py create_chart)
function createYearSheet(wb, year, categoriesIn, categoriesOut) {
  const aoa = []

  // Row 0: month headers (col 0 empty, then pairs per month)
  const headerRow = ['']
  MONTHS.forEach(() => { headerRow.push('Expected'); headerRow.push('Actual') })
  // Row 1: month names merged-style (we can't merge in array, just label col)
  const monthRow = ['']
  MONTHS.forEach(m => { monthRow.push(m); monthRow.push('') })
  aoa.push(monthRow)
  aoa.push(headerRow)

  // Input section
  aoa.push(['Input', ...Array(24).fill('')])
  categoriesIn.forEach(cat => aoa.push([cat, ...Array(24).fill('')]))
  aoa.push(['Total', ...Array(24).fill('')])

  // Output section
  aoa.push(['Output', ...Array(24).fill('')])
  categoriesOut.forEach(cat => aoa.push([cat, ...Array(24).fill('')]))
  aoa.push(['Total', ...Array(24).fill('')])

  aoa.push(['Overall Total', ...Array(24).fill('')])

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  XLSX.utils.book_append_sheet(wb, ws, String(year))
  return ws
}

// ---------------------------------------------------------------------------
// IPC Handlers
// ---------------------------------------------------------------------------

// --- Categories ---
ipcMain.handle('excel:get-categories', () => {
  const jsonPath = resolve(getTrackerPath() ? trackerPath : __dirname, '..', '..', 'json-dump.json')
  // Look for json-dump.json near Tracker.xlsx
  const candidates = [
    resolve(trackerPath, '..', 'json-dump.json'),
    resolve(app.getAppPath(), '..', 'json-dump.json')
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      const data = JSON.parse(fs.readFileSync(c, 'utf-8'))
      return { categoriesIn: data['Categories In'], categoriesOut: data['Categories Out'], jsonPath: c }
    }
  }
  return { categoriesIn: [], categoriesOut: [], jsonPath: null }
})

ipcMain.handle('excel:save-categories', (_e, { categoriesIn, categoriesOut, jsonPath }) => {
  const data = { 'Categories In': categoriesIn, 'Categories Out': categoriesOut }
  fs.writeFileSync(jsonPath, JSON.stringify(data, null, 4))
  return true
})

// --- Transactions ---
ipcMain.handle('excel:get-transactions', () => {
  const wb = loadWorkbook()
  if (!wb) return []
  ensureLogSheet(wb)
  const ws = wb.Sheets['Log']
  return sheetToObjects(ws)
})

ipcMain.handle('excel:add-transaction', (_e, { date, amount, category, description }) => {
  const wb = loadWorkbook()
  if (!wb) return false
  ensureLogSheet(wb)
  const ws = wb.Sheets['Log']
  const rows = sheetToObjects(ws)
  rows.push({ Date: date, Amount: amount, Category: category, Description: description })
  rows.sort((a, b) => parseLocalDate(b.Date) - parseLocalDate(a.Date))
  const header = [['Date','Amount','Category','Description']]
  const dataRows = rows.map(r => [r.Date, parseFloat(r.Amount) || 0, r.Category, r.Description])
  wb.Sheets['Log'] = XLSX.utils.aoa_to_sheet([...header, ...dataRows])
  saveWorkbook(wb)
  return true
})

ipcMain.handle('excel:edit-transaction', (_e, { index, date, amount, category, description }) => {
  const wb = loadWorkbook()
  if (!wb) return false
  ensureLogSheet(wb)
  const ws = wb.Sheets['Log']
  const rows = sheetToObjects(ws)
  // index is 0-based into data rows
  rows.splice(index, 1)
  rows.push({ Date: date, Amount: amount, Category: category, Description: description })
  rows.sort((a, b) => parseLocalDate(b.Date) - parseLocalDate(a.Date))
  const header = [['Date','Amount','Category','Description']]
  const dataRows = rows.map(r => [r.Date, parseFloat(r.Amount) || 0, r.Category, r.Description])
  wb.Sheets['Log'] = XLSX.utils.aoa_to_sheet([...header, ...dataRows])
  saveWorkbook(wb)
  return true
})

ipcMain.handle('excel:delete-transaction', (_e, { index }) => {
  const wb = loadWorkbook()
  if (!wb) return false
  ensureLogSheet(wb)
  const ws = wb.Sheets['Log']
  const rows = sheetToObjects(ws)
  rows.splice(index, 1)
  const header = [['Date','Amount','Category','Description']]
  const dataRows = rows.map(r => [r.Date, parseFloat(r.Amount) || 0, r.Category, r.Description])
  wb.Sheets['Log'] = XLSX.utils.aoa_to_sheet([...header, ...dataRows])
  saveWorkbook(wb)
  return true
})

// --- Year Chart ---
ipcMain.handle('excel:ensure-year-sheet', (_e, { year, categoriesIn, categoriesOut }) => {
  const wb = loadWorkbook()
  if (!wb) return false
  if (!wb.SheetNames.includes(String(year))) {
    createYearSheet(wb, year, categoriesIn, categoriesOut)
    saveWorkbook(wb)
  }
  return true
})

ipcMain.handle('excel:get-year-chart', (_e, { year, categoriesIn, categoriesOut }) => {
  const wb = loadWorkbook()
  if (!wb) return null

  ensureLogSheet(wb)

  // Ensure year sheet exists
  if (!wb.SheetNames.includes(String(year))) {
    createYearSheet(wb, year, categoriesIn, categoriesOut)
    saveWorkbook(wb)
  }

  const ws = wb.Sheets[String(year)]
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

  // Build expected maps keyed by section to avoid collisions when a category name
  // appears in both Income and Expense (e.g. "Misc").
  const expectedIn = {}
  const expectedOut = {}
  categoriesIn.forEach(c => { expectedIn[c] = {}; for (let m = 0; m < 12; m++) expectedIn[c][m] = 0 })
  categoriesOut.forEach(c => { expectedOut[c] = {}; for (let m = 0; m < 12; m++) expectedOut[c][m] = 0 })

  let inSection = false
  let outSection = false
  for (let r = 0; r < aoa.length; r++) {
    const label = String(aoa[r][0])
    if (label === 'Input') { inSection = true; outSection = false; continue }
    if (label === 'Output') { inSection = false; outSection = true; continue }
    if (label === 'Total' || label === 'Overall Total' || label === '') continue
    for (let m = 0; m < 12; m++) {
      const col = (m * 2) + 1
      const val = aoa[r][col]
      const num = val !== '' ? parseFloat(val) || 0 : 0
      if (inSection && expectedIn[label] !== undefined) expectedIn[label][m] = num
      if (outSection && expectedOut[label] !== undefined) expectedOut[label][m] = num
    }
  }

  // Compute actuals from Log sheet, separated by transaction sign to avoid
  // same-named categories (e.g. "Misc" income vs "Misc" expense) colliding.
  const logRows = sheetToObjects(wb.Sheets['Log'])
  const actualIn = {}
  const actualOut = {}
  categoriesIn.forEach(c => { actualIn[c] = {}; for (let m = 0; m < 12; m++) actualIn[c][m] = 0 })
  categoriesOut.forEach(c => { actualOut[c] = {}; for (let m = 0; m < 12; m++) actualOut[c][m] = 0 })

  logRows.forEach(row => {
    const d = parseLocalDate(row.Date)
    if (isNaN(d.getTime())) return
    if (d.getFullYear() !== year) return
    const month = d.getMonth()
    const cat = row.Category
    const amt = parseFloat(row.Amount) || 0
    if (amt >= 0 && actualIn[cat] !== undefined) {
      actualIn[cat][month] += amt
    } else if (amt < 0 && actualOut[cat] !== undefined) {
      actualOut[cat][month] += amt
    }
  })

  // Compute cumulative running total for each month of the displayed year.
  // For month m: sum of ALL transactions in the log where date <= last day of month m of year Y.
  // Intentionally includes all years and all categories (not just the current year) so the
  // value reflects the true total money in the system up to that point.
  const cumulativeByMonth = Array.from({ length: 12 }, (_, m) => {
    const cutoff = new Date(year, m + 1, 0) // day-0 of next month == last day of this month
    let total = 0
    logRows.forEach(row => {
      const d = parseLocalDate(row.Date)
      if (!isNaN(d.getTime()) && d <= cutoff) total += parseFloat(row.Amount) || 0
    })
    return total
  })

  return { expectedIn, expectedOut, actualIn, actualOut, cumulativeByMonth, months: MONTHS, categoriesIn, categoriesOut }
})

ipcMain.handle('excel:get-expectations', (_e, { year, categoriesIn, categoriesOut }) => {
  const wb = loadWorkbook()
  if (!wb) return { expectedIn: {}, expectedOut: {} }
  if (!wb.SheetNames.includes(String(year))) return { expectedIn: {}, expectedOut: {} }
  const ws = wb.Sheets[String(year)]
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  const expectedIn = {}
  const expectedOut = {}
  categoriesIn.forEach(c => { expectedIn[c] = {}; for (let m = 0; m < 12; m++) expectedIn[c][m] = 0 })
  categoriesOut.forEach(c => { expectedOut[c] = {}; for (let m = 0; m < 12; m++) expectedOut[c][m] = 0 })

  let inSection = false
  let outSection = false
  for (let r = 0; r < aoa.length; r++) {
    const label = String(aoa[r][0])
    if (label === 'Input') { inSection = true; outSection = false; continue }
    if (label === 'Output') { inSection = false; outSection = true; continue }
    if (label === 'Total' || label === 'Overall Total' || label === '') continue
    for (let m = 0; m < 12; m++) {
      const col = (m * 2) + 1
      const val = aoa[r][col]
      const num = val !== '' ? parseFloat(val) || 0 : 0
      if (inSection && expectedIn[label] !== undefined) expectedIn[label][m] = num
      if (outSection && expectedOut[label] !== undefined) expectedOut[label][m] = num
    }
  }
  return { expectedIn, expectedOut }
})

ipcMain.handle('excel:save-expectations', (_e, { year, categoriesIn, categoriesOut, expectationsIn, expectationsOut }) => {
  const wb = loadWorkbook()
  if (!wb) return false
  if (!wb.SheetNames.includes(String(year))) {
    createYearSheet(wb, year, categoriesIn, categoriesOut)
  }
  const ws = wb.Sheets[String(year)]
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

  let inSection = false
  let outSection = false
  for (let r = 0; r < aoa.length; r++) {
    const label = String(aoa[r][0])
    if (label === 'Input') { inSection = true; outSection = false; continue }
    if (label === 'Output') { inSection = false; outSection = true; continue }
    if (label === 'Total' || label === 'Overall Total' || label === '') continue
    for (let m = 0; m < 12; m++) {
      const col = (m * 2) + 1
      if (inSection && expectationsIn[label] !== undefined) aoa[r][col] = expectationsIn[label][m] ?? 0
      if (outSection && expectationsOut[label] !== undefined) aoa[r][col] = expectationsOut[label][m] ?? 0
    }
  }
  wb.Sheets[String(year)] = XLSX.utils.aoa_to_sheet(aoa)
  saveWorkbook(wb)
  return true
})

ipcMain.handle('excel:get-years', () => {
  const wb = loadWorkbook()
  if (!wb) return []
  return wb.SheetNames.filter(s => /^\d{4}$/.test(s)).map(Number).sort()
})

ipcMain.handle('excel:pick-file', async () => {
  const result = await dialog.showOpenDialog({ filters: [{ name: 'Excel', extensions: ['xlsx'] }], properties: ['openFile'] })
  if (!result.canceled && result.filePaths.length) {
    trackerPath = result.filePaths[0]
    return trackerPath
  }
  return null
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
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
