import { useReducer, useRef } from 'react'
import { useAuth } from '../../auth/useAuth'
import { useDisplaySettings } from '../../app/providers/DisplaySettingsContext'
import { updateUserDisplaySettings } from '../profile/profileApi'

type SaveState =
  { status: 'idle' | 'saving' | 'saved'; error: null } | { status: 'failed'; error: string }

const saveReducer = (_state: SaveState, next: SaveState) => next
const initialSaveState: SaveState = { status: 'idle', error: null }

/**
 * Intent: 表示設定の参照と、表示言語・文字サイズの保存・反映順序を局所化する。
 * Boundary: 設定値、保存状態、設定変更操作だけを公開する。
 * State Modeling: 保存状態とエラーをreducerで一括更新し、失敗時だけエラーを持つ。
 * Update Surface: selectLanguage / selectFontSize / setSpeechEnabled。
 * Hidden Complexity: 認証の確認、言語・文字サイズをまたいだ同時保存の抑止、成功後だけ共有設定を更新する順序。
 * Composition: AuthとDisplaySettingsを接続し、SettingsPageへ表示用の状態を渡す。
 * Test Notes: 保存失敗時の言語維持、再試行成功時のエラー解除、連続操作を確認する。
 */
export function useSettingsPage() {
  const { status: authStatus, updateUser } = useAuth()
  const { fontSize, language, speechEnabled, setFontSize, setLanguage, setSpeechEnabled } =
    useDisplaySettings()
  const [save, transition] = useReducer(saveReducer, initialSaveState)
  const [fontSizeSave, transitionFontSize] = useReducer(saveReducer, initialSaveState)
  // 両設定の保存は同じAPIがユーザー全体を返すため、古いレスポンスで新しい設定を戻さないよう直列化する。
  const inFlight = useRef(false)

  const selectLanguage = async (value: typeof language) => {
    if (authStatus !== 'authenticated' || value === language || inFlight.current) return

    inFlight.current = true
    transition({ status: 'saving', error: null })
    try {
      const result = await updateUserDisplaySettings({ displayLanguage: value }, 'error.language')
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

  // 未ログインでは端末内の表示だけを切り替え、ログイン済みならアカウントへ保存してから反映する。
  const selectFontSize = async (value: typeof fontSize) => {
    if (value === fontSize || inFlight.current) return
    if (authStatus !== 'authenticated') {
      setFontSize(value)
      return
    }

    inFlight.current = true
    transitionFontSize({ status: 'saving', error: null })
    try {
      const result = await updateUserDisplaySettings({ fontSize: value }, 'error.fontSize')
      if (!result.ok) {
        transitionFontSize({ status: 'failed', error: result.message })
        return
      }

      updateUser(result.user)
      setFontSize(result.user.fontSize)
      transitionFontSize({ status: 'saved', error: null })
    } catch {
      transitionFontSize({ status: 'failed', error: 'error.fontSize' })
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
    fontSizeStatus: fontSizeSave.status,
    fontSizeError: fontSizeSave.error,
    setSpeechEnabled,
    selectLanguage,
    selectFontSize,
  }
}
