import { useCallback, useReducer, useRef } from 'react'
import { createConcern } from './postApi'
import type { PostFormFieldErrors, PostFormInput, PostResult } from './postTypes'
import { validatePostInput } from './postTypes'

type PostSubmitState =
  | { status: 'idle'; fieldErrors: PostFormFieldErrors; error: null; result: null }
  | { status: 'submitting'; fieldErrors: PostFormFieldErrors; error: null; result: null }
  | { status: 'succeeded'; fieldErrors: PostFormFieldErrors; error: null; result: PostResult }
  | { status: 'failed'; fieldErrors: PostFormFieldErrors; error: string; result: null }

export type UsePostSubmitResult = PostSubmitState & {
  /** 保存できたかを返す。投稿できた瞬間だけ起こす画面側の動きに使う。 */
  submit: (input: PostFormInput) => Promise<boolean>
  reset: () => void
}

type PostSubmitAction =
  | { type: 'validationFailed'; fieldErrors: PostFormFieldErrors }
  | { type: 'submitStarted' }
  | { type: 'submitSucceeded'; result: PostResult }
  | { type: 'submitFailed'; error: string }
  | { type: 'reset' }

const initialPostSubmitState: PostSubmitState = {
  status: 'idle',
  fieldErrors: {},
  error: null,
  result: null,
}

function postSubmitReducer(_state: PostSubmitState, action: PostSubmitAction): PostSubmitState {
  switch (action.type) {
    case 'validationFailed':
      return {
        status: 'idle',
        fieldErrors: action.fieldErrors,
        error: null,
        result: null,
      }
    case 'submitStarted':
      return { status: 'submitting', fieldErrors: {}, error: null, result: null }
    case 'submitSucceeded':
      return { status: 'succeeded', fieldErrors: {}, error: null, result: action.result }
    case 'submitFailed':
      return { status: 'failed', fieldErrors: {}, error: action.error, result: null }
    case 'reset':
      return initialPostSubmitState
  }
}

/**
 * Intent: 投稿入力の検証、送信、結果表示までの状態遷移を局所化する。
 * Boundary: 投稿入力を受け取り、画面が必要とする状態と submit/reset 操作だけを返す。
 * State modeling: status、入力エラー、送信結果、通信エラーを reducer で同時に更新し、不整合な組み合わせを防ぐ。
 * Update Surface: submit / reset。
 * Hidden Complexity: 同期的な二重送信ロックと入力検証、API失敗を扱う。
 * Composition: usePostDraftの本文をPostPageが渡し、保存成功後に完了表示へ移る。
 * Test Notes: 空本文・通信失敗・連続送信・成功結果の保持を確認する。
 */
export function usePostSubmit(): UsePostSubmitResult {
  const [state, dispatch] = useReducer(postSubmitReducer, initialPostSubmitState)
  const inFlight = useRef(false)

  const submit = useCallback(
    async (input: PostFormInput): Promise<boolean> => {
      if (inFlight.current || state.status === 'succeeded') return false
      const validationErrors = validatePostInput(input)
      if (Object.keys(validationErrors).length > 0) {
        dispatch({ type: 'validationFailed', fieldErrors: validationErrors })
        return false
      }

      inFlight.current = true
      dispatch({ type: 'submitStarted' })
      try {
        const response = await createConcern(input)
        if (response.ok) {
          dispatch({ type: 'submitSucceeded', result: response.concern })
          return true
        }

        dispatch({ type: 'submitFailed', error: response.message })
        return false
      } catch {
        dispatch({
          type: 'submitFailed',
          error: 'error.post',
        })
        return false
      } finally {
        inFlight.current = false
      }
    },
    [state.status],
  )

  const reset = useCallback((): void => {
    dispatch({ type: 'reset' })
  }, [])

  return { ...state, submit, reset }
}
