import { useCallback, useReducer } from 'react'
import { validatePostInput } from './postTypes'

type DraftState = { step: 'write'; body: string } | { step: 'confirm'; body: string }
type DraftAction = { type: 'change'; body: string } | { type: 'confirm' } | { type: 'edit' }

function draftReducer(state: DraftState, action: DraftAction): DraftState {
  switch (action.type) {
    case 'change':
      return { step: 'write', body: action.body }
    case 'confirm':
      return Object.keys(validatePostInput({ body: state.body })).length === 0
        ? { step: 'confirm', body: state.body }
        : state
    case 'edit':
      return { step: 'write', body: state.body }
  }
}

/**
 * Intent: 本文入力と確認の遷移を局所化する。
 * Boundary: 本文・現在のステップと、変更・確認・編集の操作だけを公開する。
 * State modeling: reducerが無効な本文で確認へ進む遷移を拒否する。
 * Update surface: changeBody、confirm、edit。
 * Hidden complexity: 確認の可否は投稿の入力規則を再利用して判定する。
 * Composition: 投稿画面が送信Hookと組み合わせる。
 * Test notes: 空白、文字数超過、入力後の確認と書き直しを確認する。
 */
export function usePostDraft() {
  const [state, dispatch] = useReducer(draftReducer, { step: 'write', body: '' })
  const changeBody = useCallback((body: string) => dispatch({ type: 'change', body }), [])
  const confirm = useCallback(() => {
    const valid = Object.keys(validatePostInput({ body: state.body })).length === 0
    if (valid) dispatch({ type: 'confirm' })
    return valid
  }, [state.body])
  const edit = useCallback(() => dispatch({ type: 'edit' }), [])
  return { body: state.body, step: state.step, changeBody, confirm, edit }
}
