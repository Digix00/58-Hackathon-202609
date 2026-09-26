import { useCallback, useReducer, useRef } from 'react'
import { validatePostInput } from './postTypes'

type DraftState = { step: 'write'; body: string } | { step: 'confirm'; body: string }
type DraftAction = { type: 'confirm'; body: string } | { type: 'edit' }

function draftReducer(state: DraftState, action: DraftAction): DraftState {
  switch (action.type) {
    case 'confirm':
      return Object.keys(validatePostInput({ body: action.body })).length === 0
        ? { step: 'confirm', body: action.body }
        : state
    case 'edit':
      return { step: 'write', body: state.body }
  }
}

/**
 * Intent: 本文入力と確認の遷移を局所化する。
 * Boundary: 確認済み本文・現在のステップと、本文取得・確認・編集の操作を公開する。
 * State modeling: 入力中の本文はrefに置き、reducerは確認・編集の画面遷移だけを持つ。
 * Update surface: changeBody、getBody、confirm、edit。
 * Hidden complexity: 確認の可否は投稿の入力規則を再利用して判定する。
 * Composition: 投稿画面が送信Hookと組み合わせる。
 * Test notes: 空白、文字数超過、入力後の確認と書き直しを確認する。
 */
export function usePostDraft() {
  const [state, dispatch] = useReducer(draftReducer, { step: 'write', body: '' })
  const currentBody = useRef('')
  const changeBody = useCallback((body: string) => {
    currentBody.current = body
  }, [])
  const getBody = useCallback(() => currentBody.current, [])
  const confirm = useCallback(() => {
    const body = currentBody.current
    const valid = Object.keys(validatePostInput({ body })).length === 0
    dispatch({ type: 'confirm', body })
    return valid
  }, [])
  const edit = useCallback(() => dispatch({ type: 'edit' }), [])
  return { body: state.body, step: state.step, changeBody, getBody, confirm, edit }
}
