import { useCallback, useEffect, useReducer, useRef } from 'react'

import { registerConcernReaction } from './reactionApi'

export type ConcernReactionStatus = 'idle' | 'submitting' | 'succeeded' | 'failed'

export interface UseConcernReactionInput {
  concernId: string
  initialReactionCount: number
  initialReacted: boolean
}

export interface UseConcernReactionResult {
  status: ConcernReactionStatus
  reactionCount: number
  reacted: boolean
  error: string | null
  react: () => Promise<void>
}

interface ReactionState {
  inputKey: string
  concernId: string
  status: ConcernReactionStatus
  reactionCount: number
  reacted: boolean
  error: string | null
}

type ReactionAction =
  | { type: 'reset'; input: UseConcernReactionInput }
  | { type: 'submitStarted'; inputKey: string }
  | {
      type: 'submitSucceeded'
      inputKey: string
      reactionCount: number
      reacted: boolean
    }
  | { type: 'submitFailed'; inputKey: string; error: string }

function reactionInputKey(input: UseConcernReactionInput): string {
  return JSON.stringify([input.concernId, input.initialReactionCount, input.initialReacted])
}

function initialState(input: UseConcernReactionInput): ReactionState {
  return {
    inputKey: reactionInputKey(input),
    concernId: input.concernId,
    status: 'idle',
    reactionCount: input.initialReactionCount,
    reacted: input.initialReacted,
    error: null,
  }
}

function reactionReducer(state: ReactionState, action: ReactionAction): ReactionState {
  switch (action.type) {
    case 'reset':
      return initialState(action.input)
    case 'submitStarted':
      if (state.inputKey !== action.inputKey) return state
      return { ...state, status: 'submitting', error: null }
    case 'submitSucceeded':
      if (state.inputKey !== action.inputKey) return state
      return {
        ...state,
        status: 'succeeded',
        reactionCount: action.reactionCount,
        reacted: action.reacted,
        error: null,
      }
    case 'submitFailed':
      if (state.inputKey !== action.inputKey) return state
      return { ...state, status: 'failed', error: action.error }
  }
}

/**
 * Intent: 1件の投稿へのリアクション送信と結果状態を局所化する。
 * Boundary: 投稿IDと初期値を受け取り、表示用状態と react 操作だけを公開する。
 * State modeling: 送信状態・集計値・送信済み状態・エラーを reducer で同時に更新し、入力変更後の古いレスポンスも入力キーで無視する。
 * Update surface: react。
 * Hidden complexity: 同一投稿への二重送信を防ぎ、投稿が切り替わったときに前の投稿の状態を持ち越さない。
 * Composition: フィードや投稿詳細の表示コンポーネントから利用する。
 * Test notes: 初期値、送信中、成功、失敗、二重送信、投稿切り替え後の古いレスポンスを確認する。
 */
export function useConcernReaction({
  concernId,
  initialReactionCount,
  initialReacted,
}: UseConcernReactionInput): UseConcernReactionResult {
  const input = { concernId, initialReactionCount, initialReacted }
  const inputKey = reactionInputKey(input)
  const [state, dispatch] = useReducer(reactionReducer, input, initialState)
  const inFlightConcernIds = useRef(new Set<string>())

  useEffect(() => {
    dispatch({
      type: 'reset',
      input: { concernId, initialReactionCount, initialReacted },
    })
  }, [concernId, initialReactionCount, initialReacted])

  const currentState = state.inputKey === inputKey ? state : initialState(input)

  const react = useCallback(async (): Promise<void> => {
    if (currentState.reacted || inFlightConcernIds.current.has(concernId)) {
      return
    }

    inFlightConcernIds.current.add(concernId)
    dispatch({ type: 'submitStarted', inputKey })

    try {
      const result = await registerConcernReaction(concernId)
      if (result.ok) {
        dispatch({
          type: 'submitSucceeded',
          inputKey,
          reactionCount: result.reaction.reactionCount,
          reacted: result.reaction.reacted,
        })
        return
      }

      dispatch({
        type: 'submitFailed',
        inputKey,
        error: result.message,
      })
    } finally {
      inFlightConcernIds.current.delete(concernId)
    }
  }, [concernId, currentState.reacted, inputKey])

  return {
    status: currentState.status,
    reactionCount: currentState.reactionCount,
    reacted: currentState.reacted,
    error: currentState.error,
    react,
  }
}
