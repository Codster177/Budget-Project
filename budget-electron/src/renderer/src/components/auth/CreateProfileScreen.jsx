import { useState } from 'react'
import { Input } from '../ui/input'
import { Button } from '../ui/button'

export default function CreateProfileScreen({ onCreated, onCancel, canCancel }) {
  const [username, setUsername] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [isHidden, setIsHidden] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!username.trim()) { setError('Username is required'); return }
    if (!password) { setError('Password is required'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }

    setLoading(true)
    const result = await window.api.createProfile({ username, name, password, isHidden })
    setLoading(false)

    if (result.ok) {
      onCreated()
    } else {
      setError(result.error)
    }
  }

  return (
    <div className="flex flex-col h-screen bg-background text-foreground items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold mb-1">Create Profile</h1>
        <p className="text-sm text-muted-foreground mb-6">Set up your budget profile</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Username <span className="text-destructive">*</span></label>
            <Input
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="e.g. johndoe"
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">
              Name <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. John Doe"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Password <span className="text-destructive">*</span></label>
            <Input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Confirm Password <span className="text-destructive">*</span></label>
            <Input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="Confirm password"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isHidden}
              onChange={e => setIsHidden(e.target.checked)}
              className="rounded border-input"
            />
            <span className="text-sm">Hide from profile list</span>
          </label>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-2 justify-end mt-1">
            {canCancel && (
              <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
            )}
            <Button type="submit" disabled={loading}>
              {loading ? 'Creating…' : 'Create Profile'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
