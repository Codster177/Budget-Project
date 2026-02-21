import React from 'react'
import { cn } from '@renderer/lib/utils'

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function fmt(val) {
  if (val === 0 || val === '' || val === undefined || val === null) return '—'
  const n = parseFloat(val)
  if (isNaN(n)) return '—'
  return n < 0 ? `-$${Math.abs(n).toFixed(2)}` : `$${n.toFixed(2)}`
}

function ActualCell({ actual, expected }) {
  const a = parseFloat(actual) || 0
  const e = parseFloat(expected) || 0
  if (a === 0) return <span className="text-muted-foreground">—</span>
  const isOver = e !== 0 && Math.abs(a) > Math.abs(e)
  return (
    <span className={cn(isOver ? 'text-red-500 font-medium' : 'text-green-600 font-medium')}>
      {fmt(a)}
    </span>
  )
}

function SectionTotals({ categories, expected, actual, monthIndex }) {
  let expTotal = 0
  let actTotal = 0
  categories.forEach(cat => {
    expTotal += parseFloat(expected?.[cat]?.[monthIndex]) || 0
    actTotal += parseFloat(actual?.[cat]?.[monthIndex]) || 0
  })
  return (
    <React.Fragment>
      <td className="px-2 py-1 border border-border text-right text-muted-foreground text-xs">{fmt(expTotal)}</td>
      <td className="px-2 py-1 border border-border text-right">
        <ActualCell actual={actTotal} expected={expTotal} />
      </td>
    </React.Fragment>
  )
}

function fmtCumulative(val) {
  const n = parseFloat(val)
  if (isNaN(n) || n === 0) return '—'
  return n < 0 ? `-$${Math.abs(n).toFixed(2)}` : `$${n.toFixed(2)}`
}

export default function YearChart({ data }) {
  if (!data) return null
  const { categoriesIn, categoriesOut, expectedIn, expectedOut, actualIn, actualOut, cumulativeByMonth } = data

  function overallExpected(m) {
    let t = 0
    categoriesIn.forEach(c => { t += parseFloat(expectedIn?.[c]?.[m]) || 0 })
    categoriesOut.forEach(c => { t += parseFloat(expectedOut?.[c]?.[m]) || 0 })
    return t
  }
  function overallActual(m) {
    let t = 0
    categoriesIn.forEach(c => { t += parseFloat(actualIn?.[c]?.[m]) || 0 })
    categoriesOut.forEach(c => { t += parseFloat(actualOut?.[c]?.[m]) || 0 })
    return t
  }

  return (
    <div className="overflow-auto chart-scroll rounded-lg border border-border">
      <table className="text-xs border-collapse min-w-max">
        <thead>
          {/* Month name row */}
          <tr className="bg-muted">
            <th className="sticky left-0 z-10 bg-muted px-3 py-2 text-left font-semibold border border-border min-w-[140px]">
              Category
            </th>
            {MONTHS_SHORT.map(m => (
              <th key={m} colSpan={2} className="px-2 py-2 text-center font-semibold border border-border min-w-[120px]">
                {m}
              </th>
            ))}
          </tr>
          {/* Expected / Actual sub-header */}
          <tr className="bg-muted/50">
            <th className="sticky left-0 z-10 bg-muted/50 border border-border" />
            {MONTHS_SHORT.map(m => (
              <React.Fragment key={m}>
                <th className="px-2 py-1 text-center text-muted-foreground border border-border font-normal">Exp.</th>
                <th className="px-2 py-1 text-center text-muted-foreground border border-border font-normal">Act.</th>
              </React.Fragment>
            ))}
          </tr>
        </thead>

        <tbody>
          {/* INPUT section */}
          <tr className="bg-blue-50">
            <td colSpan={25} className="sticky left-0 px-3 py-1 font-semibold text-blue-700 border border-border text-xs uppercase tracking-wide">
              Income
            </td>
          </tr>
          {categoriesIn.map(cat => (
            <tr key={cat} className="hover:bg-muted/30 transition-colors">
              <td className="sticky left-0 z-10 bg-background px-3 py-1 border border-border font-medium">{cat}</td>
              {Array.from({ length: 12 }, (_, m) => (
                <React.Fragment key={m}>
                  <td className="px-2 py-1 border border-border text-right text-muted-foreground">
                    {fmt(expectedIn?.[cat]?.[m])}
                  </td>
                  <td className="px-2 py-1 border border-border text-right">
                    <ActualCell actual={actualIn?.[cat]?.[m]} expected={expectedIn?.[cat]?.[m]} />
                  </td>
                </React.Fragment>
              ))}
            </tr>
          ))}
          {/* Income total row */}
          <tr className="bg-blue-50/60 font-semibold">
            <td className="sticky left-0 z-10 bg-blue-50/60 px-3 py-1 border border-border">Total Income</td>
            {Array.from({ length: 12 }, (_, m) => (
              <SectionTotals key={m} categories={categoriesIn} expected={expectedIn} actual={actualIn} monthIndex={m} />
            ))}
          </tr>

          {/* OUTPUT section */}
          <tr className="bg-orange-50">
            <td colSpan={25} className="sticky left-0 px-3 py-1 font-semibold text-orange-700 border border-border text-xs uppercase tracking-wide">
              Expenses
            </td>
          </tr>
          {categoriesOut.map(cat => (
            <tr key={cat} className="hover:bg-muted/30 transition-colors">
              <td className="sticky left-0 z-10 bg-background px-3 py-1 border border-border font-medium">{cat}</td>
              {Array.from({ length: 12 }, (_, m) => (
                <React.Fragment key={m}>
                  <td className="px-2 py-1 border border-border text-right text-muted-foreground">
                    {fmt(expectedOut?.[cat]?.[m])}
                  </td>
                  <td className="px-2 py-1 border border-border text-right">
                    <ActualCell actual={actualOut?.[cat]?.[m]} expected={expectedOut?.[cat]?.[m]} />
                  </td>
                </React.Fragment>
              ))}
            </tr>
          ))}
          {/* Expense total row */}
          <tr className="bg-orange-50/60 font-semibold">
            <td className="sticky left-0 z-10 bg-orange-50/60 px-3 py-1 border border-border">Total Expenses</td>
            {Array.from({ length: 12 }, (_, m) => (
              <SectionTotals key={m} categories={categoriesOut} expected={expectedOut} actual={actualOut} monthIndex={m} />
            ))}
          </tr>

          {/* Overall net total */}
          <tr className="bg-muted font-bold">
            <td className="sticky left-0 z-10 bg-muted px-3 py-1 border border-border">Net Total</td>
            {Array.from({ length: 12 }, (_, m) => (
              <React.Fragment key={m}>
                <td className="px-2 py-1 border border-border text-right">{fmt(overallExpected(m))}</td>
                <td className="px-2 py-1 border border-border text-right">
                  <ActualCell actual={overallActual(m)} expected={overallExpected(m)} />
                </td>
              </React.Fragment>
            ))}
          </tr>

          {/* Cumulative running total — sum of all transactions in the log up to end of each month */}
          <tr className="bg-slate-100 font-bold border-t-2 border-slate-400">
            <td className="sticky left-0 z-10 bg-slate-100 px-3 py-1.5 border border-border text-slate-700">
              Cumulative Total
            </td>
            {Array.from({ length: 12 }, (_, m) => {
              const val = cumulativeByMonth?.[m] ?? 0
              const isPositive = val > 0
              const isZero = val === 0
              return (
                <td key={m} colSpan={2} className="px-2 py-1.5 border border-border text-center font-bold">
                  <span className={cn(
                    isZero ? 'text-muted-foreground' : isPositive ? 'text-green-700' : 'text-red-600'
                  )}>
                    {fmtCumulative(val)}
                  </span>
                </td>
              )
            })}
          </tr>
        </tbody>
      </table>
    </div>
  )
}
