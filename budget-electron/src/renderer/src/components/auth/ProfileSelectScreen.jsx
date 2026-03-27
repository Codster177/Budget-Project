import { useState, useEffect } from 'react'
import { Button } from '../ui/button'
import PasswordPromptDialog from './PasswordPromptDialog'
import ProfileSettingsModal from './ProfileSettingsModal'

export default function ProfileSelectScreen({ onLogin, onGoToLogin, onGoToCreate }) {
  const [profiles, setProfiles] = useState([])
  const [selectedProfile, setSelectedProfile] = useState(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    window.api.getProfiles().then(setProfiles)
  }, [])

  function handleCardClick(profile) {
    setSelectedProfile(profile)
    setDialogOpen(true)
  }

  function handleLoginSuccess(profile) {
    setDialogOpen(false)
    onLogin(profile)
  }

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      {/* Top bar */}
      <div className="flex items-center justify-end gap-2 px-6 py-4 border-b border-border">
        <Button variant="ghost" size="sm" onClick={() => setSettingsOpen(true)}>Settings</Button>
        <Button variant="outline" size="sm" onClick={onGoToCreate}>Create New Profile</Button>
        <Button size="sm" onClick={onGoToLogin}>Login</Button>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col items-center justify-center p-8">
        <h1 className="text-2xl font-semibold mb-2">Who's budgeting?</h1>
        <p className="text-sm text-muted-foreground mb-8">Select your profile to continue</p>

        {profiles.length === 0 ? (
          <p className="text-sm text-muted-foreground">No profiles found. Create one to get started.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 w-full max-w-2xl">
            {profiles.map(profile => (
              <button
                key={profile.id}
                onClick={() => handleCardClick(profile)}
                className="flex flex-col items-center justify-center gap-1 rounded-xl border border-border p-6 h-28 cursor-pointer hover:bg-accent transition-colors text-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <span className="font-semibold text-base leading-tight line-clamp-2">
                  {profile.name || profile.username}
                </span>
                {profile.name && (
                  <span className="text-xs text-muted-foreground">@{profile.username}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedProfile && (
        <PasswordPromptDialog
          profile={selectedProfile}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onSuccess={handleLoginSuccess}
        />
      )}

      <ProfileSettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  )
}
