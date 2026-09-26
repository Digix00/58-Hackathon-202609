import { useCallback, useReducer, useRef } from 'react'
import type { DisplayLanguage } from '../../app/providers/DisplaySettingsContext'
import type { QuizAnswerResponse } from '../../lib/api'
import { answerQuiz, getQuizById, type QuizMatch } from './quizApi'

type SubmitState =
  | { status: 'idle' | 'submitting' | 'succeeded' | 'unavailable'; error: null }
  | { status: 'failed'; error: string }

/**
 * Intent: 回答送信と通信失敗後の確定結果の照会を局所化する。
 * Boundary: クイズID・言語を受け取り、送信状態とsubmitだけを返す。
 * State Modeling: reducerで送信状態とエラーを一括更新し、エラーはfailed時だけ保持する。
 * Update Surface: submit。成功時だけ確定結果を返す。
 * Hidden Complexity: 同時送信の抑止、タイムアウト後の照会、公開終了の判定。
 * Composition: useQuizNavigationがuseQuizAnswersの対応を渡し、成功時に結果画面へ進む。
 * Test Notes: 成功・失敗・回答済み結果の復元・公開終了・二重送信を確認する。
 */
export function useQuizSubmit(quizId: string, language: DisplayLanguage) {
  const [state, transition] = useReducer((_state: SubmitState, next: SubmitState) => next, {
    status: 'idle',
    error: null,
  })
  const inFlight = useRef(false)
  const submit = useCallback(
    async (matches: QuizMatch[]): Promise<QuizAnswerResponse | null> => {
      if (inFlight.current || state.status === 'succeeded' || state.status === 'unavailable')
        return null
      inFlight.current = true
      transition({ status: 'submitting', error: null })
      try {
        const result = await answerQuiz(quizId, matches)
        if (result.ok) {
          transition({ status: 'succeeded', error: null })
          return result.data
        }
        if (result.code === 'QUIZ_NOT_AVAILABLE') {
          transition({ status: 'unavailable', error: null })
          return null
        }
        const latest = await getQuizById(quizId, language)
        if (latest.ok && latest.data.answered && latest.data.answerResult) {
          transition({ status: 'succeeded', error: null })
          return latest.data.answerResult
        }
        if (!latest.ok && latest.code === 'QUIZ_NOT_AVAILABLE') {
          transition({ status: 'unavailable', error: null })
          return null
        }
        transition({
          status: 'failed',
          error:
            result.code === 'QUIZ_ALREADY_ANSWERED' ? 'quiz.verifyFailed' : 'quiz.submitFailed',
        })
        return null
      } finally {
        inFlight.current = false
      }
    },
    [language, quizId, state.status],
  )

  return { ...state, submit }
}
