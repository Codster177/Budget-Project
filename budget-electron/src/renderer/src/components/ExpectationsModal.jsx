import { useState, useEffect } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

function emptyMap(categories) {
  const map = {}
  categories.forEach(cat => {
    map[cat] = {}
    for (let m = 0; m < 12; m++) map[cat][m] = ''
  })
  return map
}

export default function ExpectationsModal({ open, onOpenChange, year, categories, onSaved }) {
  const { categoriesIn, categoriesOut } = categories
  const [selectedMonth, setSelectedMonth] = useState('all')
  // Separate state for income vs expense to avoid "Misc" collision
  const [expIn, setExpIn] = useState({})
  const [expOut, setExpOut] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    window.api.getExpectations({ year, categoriesIn, categoriesOut }).then(({ expectedIn, expectedOut }) => {
      const filledIn = emptyMap(categoriesIn)
      const filledOut = emptyMap(categoriesOut)
      categoriesIn.forEach(cat => {
        if (expectedIn[cat]) {
          for (let m = 0; m < 12; m++) filledIn[cat][m] = String(expectedIn[cat][m] || '')
        }
      })
      categoriesOut.forEach(cat => {
        if (expectedOut[cat]) {
          for (let m = 0; m < 12; m++) filledOut[cat][m] = String(expectedOut[cat][m] || '')
        }
      })
      setExpIn(filledIn)
      setExpOut(filledOut)
    })
  }, [open, year, categoriesIn, categoriesOut])

  function handleChange(isIncome, cat, month, value) {
    const clean = value.replace(/[^0-9.]/g, '')
    if (isIncome) {
      setExpIn(prev => ({ ...prev, [cat]: { ...prev[cat], [month]: clean } }))
    } else {
      setExpOut(prev => ({ ...prev, [cat]: { ...prev[cat], [month]: clean } }))
    }
  }

  function handleAllMonths(isIncome, cat, value) {
    const clean = value.replace(/[^0-9.]/g, '')
    const months = {}
    for (let m = 0; m < 12; m++) months[m] = clean
    if (isIncome) {
      setExpIn(prev => ({ ...prev, [cat]: months }))
    } else {
      setExpOut(prev => ({ ...prev, [cat]: months }))
    }
  }

  async function handleSave() {
    setSaving(true)
    function toNumbers(map) {
      const out = {}
      Object.keys(map).forEach(cat => {
        out[cat] = {}
        for (let m = 0; m < 12; m++) out[cat][m] = parseFloat(map[cat][m]) || 0
      })
      return out
    }
    await window.api.saveExpectations({
      year,
      categoriesIn,
      categoriesOut,
      expectationsIn: toNumbers(expIn),
      expectationsOut: toNumbers(expOut)
    })
    setSaving(false)
    onSaved()
  }

  const showAllMonths = selectedMonth === 'all'
  const monthIndex = showAllMonths ? null : parseInt(selectedMonth)
  const map = { in: expIn, out: expOut }

  function renderRow(cat, isIncome) {
    const section = isIncome ? map.in : map.out
    if (showAllMonths) {
      const repVal = section[cat]?.[0] ?? ''
      return (
        <tr key={cat} className="border-b border-border last:border-0 hover:bg-muted/20">
          <td className="px-3 py-2 text-sm font-medium">{cat}</td>
          <td className="px-3 py-2">
            <div className="relative max-w-[140px]">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
              <Input
                className="pl-7 h-8 text-sm"
                placeholder="0.00"
                value={repVal}
                onChange={e => handleAllMonths(isIncome, cat, e.target.value)}
              />
            </div>
          </td>
          <td className="px-3 py-2 text-xs text-muted-foreground italic">Applied to all months</td>
        </tr>
      )
    }
    const val = section[cat]?.[monthIndex] ?? ''
    return (
      <tr key={cat} className="border-b border-border last:border-0 hover:bg-muted/20">
        <td className="px-3 py-2 text-sm font-medium">{cat}</td>
        <td className="px-3 py-2">
          <div className="relative max-w-[140px]">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
            <Input
              className="pl-7 h-8 text-sm"
              placeholder="0.00"
              value={val}
              onChange={e => handleChange(isIncome, cat, monthIndex, e.target.value)}
            />
          </div>
        </td>
      </tr>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Edit Expectations — {year}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-3">
          <label className="text-sm font-medium shrink-0">Month:</label>
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All months (set default)</SelectItem>
              {MONTHS.map((m, i) => (
                <SelectItem key={i} value={String(i)}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-auto flex-1 rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left font-semibold border-b border-border">Category</th>
                <th className="px-3 py-2 text-left font-semibold border-b border-border">Expected</th>
                {showAllMonths && <th className="px-3 py-2 border-b border-border" />}
              </tr>
            </thead>
            <tbody>
              <tr className="bg-blue-50">
                <td colSpan={3} className="px-3 py-1 text-xs font-semibold text-blue-700 uppercase tracking-wide">Income</td>
              </tr>
              {categoriesIn.map(cat => renderRow(cat, true))}

              <tr className="bg-orange-50">
                <td colSpan={3} className="px-3 py-1 text-xs font-semibold text-orange-700 uppercase tracking-wide">Expenses</td>
              </tr>
              {categoriesOut.map(cat => renderRow(cat, false))}
            </tbody>
          </table>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Expectations'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
