import { useState, useEffect } from 'react'
import ProfileSelectScreen from './components/auth/ProfileSelectScreen'
import CreateProfileScreen from './components/auth/CreateProfileScreen'
import LoginScreen from './components/auth/LoginScreen'
import MainApp from './components/MainApp'

export default function App() {
  const [screen, setScreen] = useState('loading')
  const [currentProfile, setCurrentProfile] = useState(null)

  useEffect(() => {
    async function init() {
      const session = await window.api.getCurrentProfile()
      if (session) {
        setCurrentProfile(session)
        setScreen('main')
      } else {
        setScreen('profile-select')
      }
    }
    init()
  }, [])

  function handleLogin(profile) {
    setCurrentProfile(profile)
    setScreen('main')
  }

  async function handleSignOut() {
    await window.api.logout()
    setCurrentProfile(null)
    setScreen('profile-select')
  }

  if (screen === 'loading') return null

  if (screen === 'profile-select') {
    return (
      <ProfileSelectScreen
        onLogin={handleLogin}
        onGoToLogin={() => setScreen('login')}
        onGoToCreate={() => setScreen('create-profile')}
      />
    )
  }

  if (screen === 'create-profile') {
    return (
      <CreateProfileScreen
        onCreated={() => setScreen('profile-select')}
        canCancel={true}
        onCancel={() => setScreen('profile-select')}
      />
    )
  }

  if (screen === 'login') {
    return (
      <LoginScreen
        onLogin={handleLogin}
        onBack={() => setScreen('profile-select')}
      />
    )
  }

  return <MainApp profile={currentProfile} onSignOut={handleSignOut} onAccountDeleted={handleSignOut} />
}
