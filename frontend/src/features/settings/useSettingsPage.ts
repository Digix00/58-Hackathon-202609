import { useState } from 'react'
import { useAuth } from '../../auth/useAuth'
import { useDisplaySettings } from '../../app/providers/DisplaySettingsContext'
import { updateUserDisplayLanguage } from '../profile/profileApi'

export function useSettingsPage() {
  const { status: authStatus, updateUser } = useAuth()
  const { fontSize, language, speechEnabled, setFontSize, setLanguage, setSpeechEnabled } =
    useDisplaySettings()
  const [languageStatus, setLanguageStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>(
    'idle',
  )
  const [languageError, setLanguageError] = useState<string | null>(null)

  const selectLanguage = async (value: typeof language) => {
    if (authStatus !== 'authenticated' || value === language || languageStatus === 'saving') return

    setLanguageStatus('saving')
    setLanguageError(null)
    try {
      const result = await updateUserDisplayLanguage(value)
      if (!result.ok) {
        setLanguageStatus('failed')
        setLanguageError(result.message)
        return
      }

      updateUser(result.user)
      setLanguage(result.user.displayLanguage)
      setLanguageStatus('saved')
    } catch {
      setLanguageStatus('failed')
      setLanguageError('error.language')
    }
  }

  return {
    authStatus,
    fontSize,
    language,
    speechEnabled,
    languageStatus,
    languageError,
    setFontSize,
    setSpeechEnabled,
    selectLanguage,
  }
}
