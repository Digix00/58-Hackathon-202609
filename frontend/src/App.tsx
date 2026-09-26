import { useEffect } from 'react'
import { RouterProvider } from 'react-router'
import { useAuth } from './auth/useAuth'
import { DisplaySettingsProvider } from './app/providers/DisplaySettingsProvider'
import { useDisplaySettings } from './app/providers/DisplaySettingsContext'
import { RuntimeProvider } from './app/providers/RuntimeProvider'
import { router } from './app/routes'
import './styles/index.css'

function SyncUserDisplayLanguage() {
  const { status, user } = useAuth()
  const { setLanguage } = useDisplaySettings()

  useEffect(() => {
    if (status === 'authenticated' && user) {
      setLanguage(user.displayLanguage)
    }
  }, [setLanguage, status, user])

  return null
}

export default function App() {
  return (
    <RuntimeProvider>
      <DisplaySettingsProvider>
        <SyncUserDisplayLanguage />
        <RouterProvider router={router} />
      </DisplaySettingsProvider>
    </RuntimeProvider>
  )
}
