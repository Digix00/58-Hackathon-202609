import { useReducer, useRef } from 'react'
import { useAuth } from '../../auth/useAuth'
import { useDisplaySettings } from '../../app/providers/DisplaySettingsContext'
import { updateUserDisplayLanguage } from '../profile/profileApi'

type LanguageSaveState =
  { status: 'idle' | 'saving' | 'saved'; error: null } | { status: 'failed'; error: string }

/**
 * Intent: 表示設定の参照と、表示言語の保存・反映順序を局所化する。
 * Boundary: 設定値、保存状態、設定変更操作だけを公開する。
 * State Modeling: 保存状態とエラーをreducerで一括更新し、失敗時だけエラーを持つ。
 * Update Surface: selectLanguage / setFontSize / setSpeechEnabled。
 * Hidden Complexity: 認証の確認、同時保存の抑止、成功後だけ共有言語を更新する順序。
 * Composition: AuthとDisplaySettingsを接続し、SettingsPageへ表示用の状態を渡す。
 * Test Notes: 保存失敗時の言語維持、再試行成功時のエラー解除、連続操作を確認する。
 */
export function useSettingsPage() {
  const { status: authStatus, updateUser } = useAuth()
  const { fontSize, language, speechEnabled, setFontSize, setLanguage, setSpeechEnabled } =
    useDisplaySettings()
  const [save, transition] = useReducer(
    (_state: LanguageSaveState, next: LanguageSaveState) => next,
    { status: 'idle', error: null },
  )
  const inFlight = useRef(false)

  const selectLanguage = async (value: typeof language) => {
    if (authStatus !== 'authenticated' || value === language || inFlight.current) return

    inFlight.current = true
    transition({ status: 'saving', error: null })
    try {
      const result = await updateUserDisplayLanguage(value)
      if (!result.ok) {
        transition({ status: 'failed', error: result.message })
        return
      }

      updateUser(result.user)
      setLanguage(result.user.displayLanguage)
      transition({ status: 'saved', error: null })
    } catch {
      transition({ status: 'failed', error: 'error.language' })
    } finally {
      inFlight.current = false
    }
  }

  return {
    authStatus,
    fontSize,
    language,
    speechEnabled,
    languageStatus: save.status,
    languageError: save.error,
    setFontSize,
    setSpeechEnabled,
    selectLanguage,
  }
}
