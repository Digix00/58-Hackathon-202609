import { useCallback, useRef, useState } from 'react'

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

interface StoredReactionState extends UseConcernReactionInput {
  status: ConcernReactionStatus
  reactionCount: number
  reacted: boolean
  error: string | null
}

function initialState(input: UseConcernReactionInput): StoredReactionState {
  return {
    ...input,
    status: 'idle',
    reactionCount: input.initialReactionCount,
    reacted: input.initialReacted,
    error: null,
  }
}

/** リアクション送信の二重実行防止と結果状態を提供する。 */
export function useConcernReaction({
  concernId,
  initialReactionCount,
  initialReacted,
}: UseConcernReactionInput): UseConcernReactionResult {
  const input = { concernId, initialReactionCount, initialReacted }
  const [storedState, setStoredState] = useState(() => initialState(input))
  const inFlightConcernIds = useRef(new Set<string>())

  const hasMatchingInput =
    storedState.concernId === concernId &&
    storedState.initialReactionCount === initialReactionCount &&
    storedState.initialReacted === initialReacted
  const currentState = hasMatchingInput ? storedState : initialState(input)

  const react = useCallback(async (): Promise<void> => {
    if (currentState.reacted || inFlightConcernIds.current.has(concernId)) {
      return
    }

    inFlightConcernIds.current.add(concernId)
    setStoredState({ ...currentState, status: 'submitting', error: null })

    try {
      const result = await registerConcernReaction(concernId)
      if (result.ok) {
        setStoredState({
          ...currentState,
          status: 'succeeded',
          reactionCount: result.reaction.reactionCount,
          reacted: result.reaction.reacted,
          error: null,
        })
        return
      }

      setStoredState({
        ...currentState,
        status: 'failed',
        error: result.message,
      })
    } finally {
      inFlightConcernIds.current.delete(concernId)
    }
  }, [concernId, currentState])

  return {
    status: currentState.status,
    reactionCount: currentState.reactionCount,
    reacted: currentState.reacted,
    error: currentState.error,
    react,
  }
}
