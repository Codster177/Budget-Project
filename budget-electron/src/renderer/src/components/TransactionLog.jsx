import { useState, useEffect } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import AddTransactionModal from './AddTransactionModal'
import { Pencil, Trash2, Search, X } from 'lucide-react'
import { format } from 'date-fns'

function formatDate(dateStr) {
  if (!dateStr) return ''
  try {
    const s = String(dateStr)
    // ISO date-only strings (yyyy-MM-dd) must be parsed in local time.
    // new Date("2024-01-15") treats it as UTC midnight and shifts back a day in negative-offset zones.
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (iso) {
      const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
      return format(d, 'MMM d, yyyy')
    }
    const d = new Date(s)
    if (!isNaN(d.getTime())) return format(d, 'MMM d, yyyy')
  } catch {}
  return String(dateStr)
}

function formatAmt(val) {
  const n = parseFloat(val)
  if (isNaN(n)) return val
  return n < 0 ? `-$${Math.abs(n).toFixed(2)}` : `$${n.toFixed(2)}`
}

// Returns true if the transaction matches the search query across all fields.
function matchesQuery(tx, query) {
  if (!query) return true
  const q = query.toLowerCase()
  return [
    formatDate(tx.Date),
    String(tx.Date),
    formatAmt(tx.Amount),
    String(tx.Amount),
    tx.Category,
    tx.Description
  ].some(field => String(field).toLowerCase().includes(q))
}

export default function TransactionLog({ open, onOpenChange, categories, onChanged }) {
  const [transactions, setTransactions] = useState([])
  const [query, setQuery] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const [editTx, setEditTx] = useState(null)
  const [editIndex, setEditIndex] = useState(null)

  async function load() {
    const rows = await window.api.getTransactions()
    setTransactions(rows)
  }

  useEffect(() => {
    if (open) {
      load()
      setQuery('')
    }
  }, [open])

  async function handleDelete(originalIndex) {
    await window.api.deleteTransaction({ index: originalIndex })
    await load()
    onChanged()
  }

  function handleEdit(tx, originalIndex) {
    setEditTx(tx)
    setEditIndex(originalIndex)
    setEditOpen(true)
  }

  async function handleEditSaved() {
    setEditOpen(false)
    await load()
    onChanged()
  }

  // Pair each transaction with its original index before filtering so that
  // delete/edit always reference the correct row in the data file.
  const filtered = transactions
    .map((tx, i) => ({ tx, originalIndex: i }))
    .filter(({ tx }) => matchesQuery(tx, query))

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Transaction Log</DialogTitle>
          </DialogHeader>

          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              className="pl-9 pr-9"
              placeholder="Search by date, amount, category, or description…"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
            {query && (
              <button
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setQuery('')}
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Result count when filtering */}
          {query && (
            <p className="text-xs text-muted-foreground -mt-1">
              {filtered.length} of {transactions.length} transaction{transactions.length !== 1 ? 's' : ''}
            </p>
          )}

          <div className="overflow-auto flex-1 rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold border-b border-border">Date</th>
                  <th className="px-3 py-2 text-right font-semibold border-b border-border">Amount</th>
                  <th className="px-3 py-2 text-left font-semibold border-b border-border">Category</th>
                  <th className="px-3 py-2 text-left font-semibold border-b border-border">Description</th>
                  <th className="px-3 py-2 border-b border-border" />
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                      {query ? 'No transactions match your search.' : 'No transactions yet.'}
                    </td>
                  </tr>
                )}
                {filtered.map(({ tx, originalIndex }) => {
                  const amt = parseFloat(tx.Amount)
                  const isIncome = amt >= 0
                  return (
                    <tr key={originalIndex} className="hover:bg-muted/30 border-b border-border last:border-0">
                      <td className="px-3 py-2 text-muted-foreground">{formatDate(tx.Date)}</td>
                      <td className={`px-3 py-2 text-right font-medium tabular-nums ${isIncome ? 'text-green-600' : 'text-red-500'}`}>
                        {formatAmt(tx.Amount)}
                      </td>
                      <td className="px-3 py-2">{tx.Category}</td>
                      <td className="px-3 py-2 text-muted-foreground max-w-[200px] truncate">{tx.Description}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1 justify-end">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(tx, originalIndex)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(originalIndex)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>

      <AddTransactionModal
        open={editOpen}
        onOpenChange={setEditOpen}
        categories={categories}
        editTransaction={editTx}
        editIndex={editIndex}
        onSaved={handleEditSaved}
      />
    </>
  )
}
