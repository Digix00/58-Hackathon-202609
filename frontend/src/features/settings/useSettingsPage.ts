import { useState } from 'react'
import { useAuth } from '../../auth/useAuth'
import { useDisplaySettings } from '../../app/providers/DisplaySettingsContext'
import { updateUserDisplaySettings } from '../profile/profileApi'

type SaveStatus = 'idle' | 'saving' | 'saved' | 'failed'

export function useSettingsPage() {
  const { status: authStatus, updateUser } = useAuth()
  const { fontSize, language, speechEnabled, setFontSize, setLanguage, setSpeechEnabled } =
    useDisplaySettings()
  const [languageStatus, setLanguageStatus] = useState<SaveStatus>('idle')
  const [languageError, setLanguageError] = useState<string | null>(null)
  const [fontSizeStatus, setFontSizeStatus] = useState<SaveStatus>('idle')
  const [fontSizeError, setFontSizeError] = useState<string | null>(null)

  const selectLanguage = async (value: typeof language) => {
    if (authStatus !== 'authenticated' || value === language || languageStatus === 'saving') return

    setLanguageStatus('saving')
    setLanguageError(null)
    try {
      const result = await updateUserDisplaySettings({ displayLanguage: value }, 'error.language')
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

  // 未ログインでは端末内の表示だけを切り替え、ログイン済みならアカウントへ保存してから反映する。
  const selectFontSize = async (value: typeof fontSize) => {
    if (value === fontSize || fontSizeStatus === 'saving') return
    if (authStatus !== 'authenticated') {
      setFontSize(value)
      return
    }

    setFontSizeStatus('saving')
    setFontSizeError(null)
    try {
      const result = await updateUserDisplaySettings({ fontSize: value }, 'error.fontSize')
      if (!result.ok) {
        setFontSizeStatus('failed')
        setFontSizeError(result.message)
        return
      }

      updateUser(result.user)
      setFontSize(result.user.fontSize)
      setFontSizeStatus('saved')
    } catch {
      setFontSizeStatus('failed')
      setFontSizeError('error.fontSize')
    }
  }

  return {
    authStatus,
    fontSize,
    language,
    speechEnabled,
    languageStatus,
    languageError,
    fontSizeStatus,
    fontSizeError,
    setSpeechEnabled,
    selectLanguage,
    selectFontSize,
  }
}
