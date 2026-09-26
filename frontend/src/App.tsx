import { useEffect } from 'react'
import { RouterProvider } from 'react-router'
import { useAuth } from './auth/useAuth'
import { DisplaySettingsProvider } from './app/providers/DisplaySettingsProvider'
import { useDisplaySettings } from './app/providers/DisplaySettingsContext'
import { RuntimeProvider } from './app/providers/RuntimeProvider'
import { router } from './app/routes'
import { translate } from './i18n/translate'
import './styles/index.css'

function SyncUserDisplaySettings() {
  const { status, user } = useAuth()
  const { language, setFontSize, setLanguage } = useDisplaySettings()

  useEffect(() => {
    document.documentElement.lang = language === 'en' ? 'en' : 'ja'
    document.title = translate(language, 'app.name')
  }, [language])

  useEffect(() => {
    if (status === 'authenticated' && user) {
      setLanguage(user.displayLanguage)
      setFontSize(user.fontSize)
    }
  }, [setFontSize, setLanguage, status, user])

  return null
}

export default function App() {
  return (
    <RuntimeProvider>
      <DisplaySettingsProvider>
        <SyncUserDisplaySettings />
        <RouterProvider router={router} />
      </DisplaySettingsProvider>
    </RuntimeProvider>
  )
}
