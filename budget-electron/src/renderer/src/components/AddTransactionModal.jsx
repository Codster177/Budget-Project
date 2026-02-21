import { useState, useEffect } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog'
import { cn } from '@renderer/lib/utils'
import { format } from 'date-fns'

const today = format(new Date(), 'yyyy-MM-dd')

export default function AddTransactionModal({ open, onOpenChange, categories, onSaved, editTransaction, editIndex }) {
  const isEdit = editTransaction != null
  const [direction, setDirection] = useState(null) // 'in' | 'out'
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today)
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')

  // Populate fields when editing
  useEffect(() => {
    if (!open) return
    if (isEdit) {
      const amt = parseFloat(editTransaction.Amount)
      setDirection(amt >= 0 ? 'in' : 'out')
      setAmount(String(Math.abs(amt)))
      setDate(editTransaction.Date ? editTransaction.Date.slice(0, 10) : today)
      setCategory(editTransaction.Category || '')
      setDescription(editTransaction.Description || '')
    } else {
      setDirection(null)
      setAmount('')
      setDate(today)
      setCategory('')
      setDescription('')
    }
    setError('')
  }, [open, isEdit])

  const categoryList = direction === 'in'
    ? categories.categoriesIn
    : direction === 'out'
    ? categories.categoriesOut
    : []

  const canSubmit = direction && amount && parseFloat(amount) > 0 && category && date

  async function handleSubmit() {
    setError('')
    const numAmount = parseFloat(amount) * (direction === 'out' ? -1 : 1)
    if (isNaN(numAmount)) { setError('Invalid amount'); return }

    // Format date as ISO string for storage
    const payload = {
      date,
      amount: numAmount,
      category,
      description
    }

    try {
      if (isEdit) {
        await window.api.editTransaction({ index: editIndex, ...payload })
      } else {
        await window.api.addTransaction(payload)
      }
      onSaved()
    } catch (e) {
      setError('Failed to save transaction.')
    }
  }

  function handleAmountChange(e) {
    const val = e.target.value.replace(/[^0-9.]/g, '')
    setAmount(val)
  }

  // When direction changes, reset category if it doesn't fit
  function handleDirection(dir) {
    setDirection(dir)
    setCategory('')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Transaction' : 'Add Transaction'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Direction toggle */}
          <div className="flex gap-2">
            <Button
              variant={direction === 'in' ? 'default' : 'outline'}
              className="flex-1"
              onClick={() => handleDirection('in')}
            >
              Income
            </Button>
            <Button
              variant={direction === 'out' ? 'destructive' : 'outline'}
              className="flex-1"
              onClick={() => handleDirection('out')}
            >
              Expense
            </Button>
          </div>

          {/* Amount */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Amount</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
              <Input
                className="pl-7"
                placeholder="0.00"
                value={amount}
                onChange={handleAmountChange}
                disabled={!direction}
              />
            </div>
          </div>

          {/* Date */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Date</label>
            <Input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              disabled={!direction}
            />
          </div>

          {/* Category */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Category</label>
            <Select value={category} onValueChange={setCategory} disabled={!direction}>
              <SelectTrigger>
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {categoryList.map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Description */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Description</label>
            <textarea
              className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
              placeholder="Optional note…"
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {isEdit ? 'Save Changes' : 'Add Transaction'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
