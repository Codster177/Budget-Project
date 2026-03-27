import { useState } from 'react'
import { Input } from '../ui/input'
import { Button } from '../ui/button'

export default function LoginScreen({ onLogin, onBack }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!username.trim() || !password) { setError('Username and password are required'); return }
    setLoading(true)
    const result = await window.api.login({ username, password })
    setLoading(false)
    if (result.ok) {
      onLogin(result.profile)
    } else {
      setError(result.error)
    }
  }

  return (
    <div className="flex flex-col h-screen bg-background text-foreground items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold mb-1">Sign In</h1>
        <p className="text-sm text-muted-foreground mb-6">Works for all accounts, including hidden profiles</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Username</label>
            <Input
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Username"
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Password</label>
            <Input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-2 justify-end mt-1">
            <Button type="button" variant="outline" onClick={onBack}>Back</Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign In'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
