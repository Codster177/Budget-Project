import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { RefreshCw, X, Plus, CalendarDays } from 'lucide-react'

export default function SettingsModal({ open, onOpenChange, profile, onAccountDeleted, onSyncComplete }) {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [items, setItems] = useState([])
  const [autoSync, setAutoSync] = useState(false)
  const [syncing, setSyncing] = useState(new Set())
  const [linking, setLinking] = useState(false)
  const [autoSyncLoading, setAutoSyncLoading] = useState(false)
  const [linkError, setLinkError] = useState('')

  const [expandedLookback, setExpandedLookback] = useState(null)
  const [lookbackDates, setLookbackDates] = useState({})
  const [applyingLookback, setApplyingLookback] = useState(new Set())

  const todayStr = new Date().toISOString().slice(0, 10)
  const minDateStr = (() => { const d = new Date(); d.setDate(d.getDate() - 730); return d.toISOString().slice(0, 10) })()

  useEffect(() => {
    if (open) {
      setLinkError('')
      Promise.all([window.api.getPlaidItems(), window.api.getAutoSync()])
        .then(([fetchedItems, fetchedAutoSync]) => {
          setItems(fetchedItems)
          setAutoSync(fetchedAutoSync)
          const uninitialized = fetchedItems.find(i => !i.start_date)
          if (uninitialized) {
            setExpandedLookback(uninitialized.id)
            setLookbackDates(prev => ({ ...prev, [uninitialized.id]: todayStr }))
          }
        })
    }
  }, [open])

  function handleClose(val) {
    if (!val) setConfirming(false)
    onOpenChange(val)
  }

  async function handleDelete() {
    setDeleting(true)
    const result = await window.api.deleteAccount()
    setDeleting(false)
    if (result.ok) {
      handleClose(false)
      onAccountDeleted()
    }
  }

  async function handleAddBank() {
    setLinkError('')
    setLinking(true)
    const result = await window.api.openPlaidLink()
    setLinking(false)
    if (result.ok) {
      const updated = await window.api.getPlaidItems()
      setItems(updated)
      setExpandedLookback(result.newItemId)
      setLookbackDates(prev => ({ ...prev, [result.newItemId]: todayStr }))
    } else if (result.error) {
      setLinkError(result.error)
    }
  }

  async function handleSync(id) {
    setSyncing(prev => new Set(prev).add(id))
    const result = await window.api.syncPlaidItem({ id })
    setSyncing(prev => { const n = new Set(prev); n.delete(id); return n })
    if (result.ok) onSyncComplete?.()
  }

  async function handleRemove(id) {
    await window.api.removePlaidItem({ id })
    setItems(prev => prev.filter(i => i.id !== id))
  }

  async function handleAutoSyncToggle() {
    const next = !autoSync
    setAutoSync(next)
    setAutoSyncLoading(true)
    await window.api.setAutoSync({ enabled: next })
    setAutoSyncLoading(false)
    if (next) onSyncComplete?.()
  }

  async function handleApplyLookback(id) {
    const start_date = lookbackDates[id]
    if (!start_date) return
    setApplyingLookback(prev => new Set(prev).add(id))
    const result = await window.api.setLookback({ id, start_date })
    setApplyingLookback(prev => { const n = new Set(prev); n.delete(id); return n })
    if (result.ok) {
      setExpandedLookback(null)
      const updated = await window.api.getPlaidItems()
      setItems(updated)
      onSyncComplete?.()
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

        {!confirming ? (
          <div className="flex flex-col gap-4 pt-1">

            {/* Connected Banks */}
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Connected Banks</p>

              {items.length === 0 && (
                <p className="text-sm text-muted-foreground py-1">No banks connected yet.</p>
              )}

              {items.map(item => {
                const isExpanded = expandedLookback === item.id
                const isApplying = applyingLookback.has(item.id)
                const selectedDate = lookbackDates[item.id] || todayStr
                const thirtyDaysAgo = (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10) })()
                const isLongLookback = selectedDate < thirtyDaysAgo

                return (
                  <React.Fragment key={item.id}>
                    <div className={`flex items-center justify-between rounded-lg border border-border px-3 py-2 gap-2 ${isApplying ? 'opacity-60' : ''}`}>
                      <span className="text-sm font-medium flex-1 min-w-0 truncate">{item.institution_name}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`h-7 w-7 ${isExpanded ? 'text-primary' : ''}`}
                          onClick={() => setExpandedLookback(isExpanded ? null : item.id)}
                          disabled={isApplying}
                          title="Set history start date"
                        >
                          <CalendarDays className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleSync(item.id)}
                          disabled={syncing.has(item.id) || isApplying}
                          title="Sync now"
                        >
                          <RefreshCw className={`h-3.5 w-3.5 ${syncing.has(item.id) ? 'animate-spin' : ''}`} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => handleRemove(item.id)}
                          disabled={isApplying}
                          title="Remove bank"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 flex flex-col gap-2 -mt-1 ml-2">
                        <p className="text-xs text-muted-foreground font-medium">Import history starting from:</p>
                        <div className="flex items-center gap-2">
                          <input
                            type="date"
                            value={selectedDate}
                            min={minDateStr}
                            max={todayStr}
                            onChange={e => setLookbackDates(prev => ({ ...prev, [item.id]: e.target.value }))}
                            className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm"
                          />
                          <Button
                            size="sm"
                            onClick={() => handleApplyLookback(item.id)}
                            disabled={isApplying || !selectedDate}
                            className="shrink-0"
                          >
                            {isApplying ? 'Syncing…' : 'Apply'}
                          </Button>
                        </div>
                        {isLongLookback && (
                          <p className="text-xs text-amber-600 dark:text-amber-400">
                            Importing over a month of history may take a while.
                          </p>
                        )}
                      </div>
                    )}
                  </React.Fragment>
                )
              })}

              <div className="flex items-center justify-between mt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={autoSync}
                    onChange={handleAutoSyncToggle}
                    disabled={autoSyncLoading}
                    className="rounded border-input"
                  />
                  <span className="text-sm text-muted-foreground">
                    Auto-sync on login
                    {autoSyncLoading && <span className="ml-1 text-xs">(syncing…)</span>}
                  </span>
                </label>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleAddBank}
                  disabled={linking}
                  className="gap-1.5"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {linking ? 'Connecting…' : 'Add Bank'}
                </Button>
              </div>

              {linkError && (
                <p className="text-xs text-destructive">{linkError}</p>
              )}
            </div>

            <div className="border-t border-border" />

            {/* Delete Account */}
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">Delete Account</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Permanently remove this profile and all its data
                </p>
              </div>
              <Button variant="destructive" size="sm" onClick={() => setConfirming(true)}>
                Delete
              </Button>
            </div>

          </div>
        ) : (
          <div className="flex flex-col gap-4 pt-1">
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
              <p className="text-sm font-semibold text-destructive mb-1">Are you sure?</p>
              <p className="text-sm text-muted-foreground">
                This will permanently delete the account{' '}
                <span className="font-medium text-foreground">
                  {profile.name || profile.username}
                </span>{' '}
                and erase <span className="font-medium text-foreground">all of its data</span> —
                transactions, categories, expectations, and connected banks. This cannot be undone.
              </p>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setConfirming(false)} disabled={deleting}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Yes, Delete Everything'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
