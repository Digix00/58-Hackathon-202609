import { useCallback, useEffect, useReducer, useRef } from 'react'
import type { MessageKey } from '../../i18n/messages'
import { SpeechInputError, transcribeSpeech } from './speechApi'
import {
  startSpeechRecording,
  supportedRecordingType,
  type SpeechRecording,
} from './speechRecording'

type SpeechState =
  | { status: 'idle' | 'requesting' | 'transcribing' }
  | { status: 'recording'; seconds: number }
  | { status: 'review'; text: string }
  | { status: 'error'; message: MessageKey }

function speechReducer(state: SpeechState, next: SpeechState): SpeechState {
  if (
    next.status === 'recording' &&
    state.status !== 'requesting' &&
    state.status !== 'recording'
  ) {
    return state
  }
  if (next.status === 'recording' && state.status === 'recording' && next.seconds === state.seconds)
    return state
  return next
}

function errorMessage(error: unknown): MessageKey {
  if (error instanceof SpeechInputError) return error.key
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError')
      return 'speech.permission'
    if (error.name === 'NotSupportedError') return 'speech.unsupported'
    if (error.name === 'NotFoundError' || error.name === 'NotReadableError')
      return 'speech.microphone'
    if (error.name === 'QuotaExceededError') return 'speech.tooLarge'
  }
  return 'speech.failed'
}

/**
 * Intent: 音声入力の状態遷移とキャンセルを局所化する。
 * Boundary: 状態・対応可否と開始・停止・破棄のみを公開する。
 * State modeling: reducerで権限待ち、録音、通信、確認、失敗を排他的に表す。
 * Hidden complexity: 操作ごとのAbortControllerで古い録音や通信の結果を無効化する。
 * Composition: 投稿画面が既存本文への追加と確認画面への移動を担当する。
 * Test notes: 権限待ちの破棄、離脱、二重開始、停止後の失敗を確認する。
 */
export function useSpeechInput() {
  const [state, dispatch] = useReducer(speechReducer, { status: 'idle' })
  const operation = useRef<AbortController | null>(null)
  const recording = useRef<SpeechRecording | null>(null)
  const supported = Boolean(supportedRecordingType())

  const cancel = useCallback(() => {
    operation.current?.abort()
    operation.current = null
    recording.current = null
    dispatch({ status: 'idle' })
  }, [])

  useEffect(() => {
    const interrupt = () => {
      if (operation.current) {
        cancel()
        dispatch({ status: 'error', message: 'speech.interrupted' })
      }
    }
    const onVisibility = () => {
      if (document.hidden) interrupt()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', interrupt)
    return () => {
      operation.current?.abort()
      operation.current = null
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', interrupt)
    }
  }, [cancel])

  const start = async () => {
    if (operation.current) return
    const controller = new AbortController()
    operation.current = controller
    dispatch({ status: 'requesting' })
    try {
      const session = await startSpeechRecording(controller.signal, (seconds) => {
        if (!controller.signal.aborted) dispatch({ status: 'recording', seconds })
      })
      if (!controller.signal.aborted) {
        recording.current = session
        dispatch({ status: 'recording', seconds: 0 })
      }
      const audio = await session.audio
      controller.signal.throwIfAborted()
      recording.current = null
      dispatch({ status: 'transcribing' })
      const text = await transcribeSpeech(audio, controller.signal)
      controller.signal.throwIfAborted()
      dispatch({ status: 'review', text })
    } catch (error) {
      if (!controller.signal.aborted) dispatch({ status: 'error', message: errorMessage(error) })
    } finally {
      if (operation.current === controller) {
        operation.current = null
        recording.current = null
      }
    }
  }

  const stop = () => {
    if (!recording.current) return
    dispatch({ status: 'transcribing' })
    recording.current.stop()
  }
  const busy = state.status !== 'idle' && state.status !== 'error'
  return { state, supported, busy, start, stop, cancel }
}

export type SpeechInput = ReturnType<typeof useSpeechInput>
