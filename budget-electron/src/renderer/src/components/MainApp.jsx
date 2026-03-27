import { useState, useEffect, useCallback } from 'react'
import { Button } from './ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import YearChart from './YearChart'
import TransactionLog from './TransactionLog'
import AddTransactionModal from './AddTransactionModal'
import ExpectationsModal from './ExpectationsModal'
import CategoriesModal from './CategoriesModal'
import SettingsModal from './SettingsModal'

export default function MainApp({ profile, onSignOut, onAccountDeleted }) {
  const [year, setYear] = useState(new Date().getFullYear())
  const [categories, setCategories] = useState({ categoriesIn: [], categoriesOut: [], jsonPath: null })
  const [chartData, setChartData] = useState(null)
  const [chartKey, setChartKey] = useState(0)

  const [logOpen, setLogOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [expectOpen, setExpectOpen] = useState(false)
  const [catOpen, setCatOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Load categories on mount + listen for background Plaid sync completions
  useEffect(() => {
    window.api.getCategories().then(setCategories)
    window.api.onSyncComplete(() => refreshChart())
  }, [])

  const refreshChart = useCallback(() => {
    if (!categories.categoriesIn.length && !categories.categoriesOut.length) return
    window.api.getYearChart({
      year,
      categoriesIn: categories.categoriesIn,
      categoriesOut: categories.categoriesOut
    }).then(data => {
      setChartData(data)
      setChartKey(k => k + 1)
    })
  }, [year, categories])

  useEffect(() => {
    refreshChart()
  }, [refreshChart])

  const handleCategoriesSaved = (newCats) => {
    setCategories(newCats)
    setCatOpen(false)
  }

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      {/* Navbar */}
      <nav className="flex items-center justify-between px-4 h-11 border-b border-border bg-background shrink-0">
        <span className="text-sm font-medium">
          Welcome, <span className="font-semibold">{profile.name || profile.username}</span>
        </span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => setSettingsOpen(true)}>Settings</Button>
          <Button variant="ghost" size="sm" onClick={onSignOut}>Sign Out</Button>
        </div>
      </nav>

      {/* Three-panel row */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left sidebar */}
        <aside className="flex flex-col gap-3 items-center justify-center px-4 py-8 border-r border-border w-44 shrink-0">
          <Button variant="outline" className="w-full" onClick={() => setLogOpen(true)}>
            View Log
          </Button>
          <Button variant="outline" className="w-full" onClick={() => setCatOpen(true)}>
            Edit Categories
          </Button>
        </aside>

        {/* Center — year chart */}
        <main className="flex flex-col flex-1 min-w-0 overflow-hidden">
          {/* Year navigation bar */}
          <div className="flex items-center justify-center gap-4 py-3 border-b border-border shrink-0">
            <Button variant="ghost" size="icon" onClick={() => setYear(y => y - 1)}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <span className="text-xl font-semibold w-16 text-center">{year}</span>
            <Button variant="ghost" size="icon" onClick={() => setYear(y => y + 1)}>
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>

          {/* Chart area */}
          <div className="flex-1 overflow-auto chart-scroll p-2">
            {chartData ? (
              <YearChart key={chartKey} data={chartData} />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                Loading chart…
              </div>
            )}
          </div>
        </main>

        {/* Right sidebar */}
        <aside className="flex flex-col gap-3 items-center justify-center px-4 py-8 border-l border-border w-44 shrink-0">
          <Button className="w-full" onClick={() => setAddOpen(true)}>
            Add Transaction
          </Button>
          <Button variant="outline" className="w-full" onClick={() => setExpectOpen(true)}>
            Edit Expectations
          </Button>
        </aside>
      </div>

      {/* Modals */}
      <TransactionLog
        open={logOpen}
        onOpenChange={setLogOpen}
        categories={categories}
        onChanged={refreshChart}
      />

      <AddTransactionModal
        open={addOpen}
        onOpenChange={setAddOpen}
        categories={categories}
        onSaved={() => { setAddOpen(false); refreshChart() }}
      />

      <ExpectationsModal
        open={expectOpen}
        onOpenChange={setExpectOpen}
        year={year}
        categories={categories}
        onSaved={() => { setExpectOpen(false); refreshChart() }}
      />

      <CategoriesModal
        open={catOpen}
        onOpenChange={setCatOpen}
        categories={categories}
        onSaved={handleCategoriesSaved}
      />

      <SettingsModal
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        profile={profile}
        onAccountDeleted={onAccountDeleted}
        onSyncComplete={refreshChart}
      />
    </div>
  )
}
