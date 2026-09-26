import { useCallback, useReducer, useRef } from 'react'
import { useAuth } from '../../auth/useAuth'
import { updateUserProfile, type UserProfileInput } from '../profile/profileApi'

type SaveState = { status: 'idle' | 'saving'; error: null } | { status: 'failed'; error: string }

/**
 * Intent: 初期プロフィール保存とセッション更新の順序を局所化する。
 * Boundary: submitで完成した入力を受け取り、保存中・エラー・保存結果だけを公開する。
 * State Modeling: 保存状態とエラーをreducerで同時更新し、failed時だけエラーを持つ。
 * Update Surface: submit / clearError。
 * Hidden Complexity: 同時送信の抑止、profileCompletedの再取得を待つ順序。
 * Composition: useOnboardingNotebookは成功時だけ画面遷移する。
 * Test Notes: API失敗、セッション更新待ち、二重送信、再入力後のエラー解除を確認する。
 */
export function useOnboardingSubmit() {
  const { refresh } = useAuth()
  const [state, transition] = useReducer((_state: SaveState, next: SaveState) => next, {
    status: 'idle',
    error: null,
  })
  const inFlight = useRef(false)
  const clearError = useCallback(() => {
    if (!inFlight.current) transition({ status: 'idle', error: null })
  }, [])
  const submit = useCallback(
    async (input: UserProfileInput): Promise<boolean> => {
      if (inFlight.current) return false
      inFlight.current = true
      transition({ status: 'saving', error: null })
      try {
        const result = await updateUserProfile(input)
        if (!result.ok) {
          transition({ status: 'failed', error: result.message })
          return false
        }
        await refresh()
        return true
      } catch {
        transition({ status: 'failed', error: 'error.onboarding' })
        return false
      } finally {
        inFlight.current = false
      }
    },
    [refresh],
  )
  return { saving: state.status === 'saving', error: state.error, submit, clearError }
}
