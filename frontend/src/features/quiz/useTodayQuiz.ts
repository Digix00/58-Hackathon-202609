import { useCallback, useEffect, useReducer, useRef } from 'react'
import type { QuizAnswerResponse } from '../../lib/api'
import type { DisplayLanguage } from '../../app/providers/DisplaySettingsContext'
import { getTodayQuiz } from './quizApi'
import { toQuizPageModel, hasThreeUniqueQuizItems, type QuizPageModel } from './quizViewModel'

type QuizLoadState =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'error' }
  | { status: 'ready'; quiz: QuizPageModel }

type QuizLoadAction =
  | { type: 'loading' }
  | { type: 'unavailable' }
  | { type: 'error' }
  | { type: 'ready'; quiz: QuizPageModel }
  | { type: 'answerReceived'; answerResult: QuizAnswerResponse }

function quizLoadReducer(_state: QuizLoadState, action: QuizLoadAction): QuizLoadState {
  switch (action.type) {
    case 'loading':
      return { status: 'loading' }
    case 'unavailable':
      return { status: 'unavailable' }
    case 'error':
      return { status: 'error' }
    case 'ready':
      // 言語だけの再取得では、回答中の順番と選択を保つ。
      if (_state.status === 'ready' && _state.quiz.id === action.quiz.id) {
        return {
          status: 'ready',
          quiz: {
            ...action.quiz,
            people: _state.quiz.people,
            letters: _state.quiz.letters.map(
              (letter) => action.quiz.letters.find((next) => next.id === letter.id) ?? letter,
            ),
            answerResult: action.quiz.answerResult ?? _state.quiz.answerResult,
          },
        }
      }
      return { status: 'ready', quiz: action.quiz }
    case 'answerReceived':
      return _state.status === 'ready'
        ? { ..._state, quiz: { ..._state.quiz, answerResult: action.answerResult } }
        : _state
  }
}

/**
 * Intent: 今日のクイズの取得と再取得を局所化する。
 * Boundary: 取得可否と言語を受け取り、取得状態・再試行・確定回答の反映だけを返す。
 * State Modeling: ready時だけデータを持つUnionとreducerで空の成功状態を防ぐ。
 * Update Surface: retry / receiveAnswer。
 * Hidden Complexity: 古い応答の破棄、同じクイズの言語変更時の並びと回答結果の保持。
 * Composition: QuizPageが利用条件を渡し、取得済みViewModelをQuizContextへ渡す。
 * Test Notes: 未認証時の取得抑止、失敗後の再試行、言語変更、回答反映を確認する。
 */
export function useTodayQuiz(enabled: boolean, language: DisplayLanguage) {
  const requestVersion = useRef(0)

  const [loadState, dispatchLoad] = useReducer(quizLoadReducer, { status: 'loading' })

  const receiveAnswer = useCallback((answerResult: QuizAnswerResponse) => {
    dispatchLoad({ type: 'answerReceived', answerResult })
  }, [])

  const loadQuiz = useCallback(async () => {
    const version = ++requestVersion.current
    const result = await getTodayQuiz(language)
    if (version !== requestVersion.current) return
    if (!result.ok) {
      dispatchLoad({ type: result.code === 'QUIZ_NOT_AVAILABLE' ? 'unavailable' : 'error' })
      return
    }
    if (!hasThreeUniqueQuizItems(result.data)) {
      dispatchLoad({ type: 'unavailable' })
      return
    }
    if (result.data.answered && !result.data.answerResult) {
      dispatchLoad({ type: 'error' })
      return
    }

    dispatchLoad({ type: 'ready', quiz: toQuizPageModel(result.data) })
  }, [language])

  const retry = useCallback(() => {
    dispatchLoad({ type: 'loading' })
    void loadQuiz()
  }, [dispatchLoad, loadQuiz])

  useEffect(() => {
    if (!enabled) return
    void loadQuiz()
    return () => {
      requestVersion.current += 1
    }
  }, [enabled, loadQuiz])

  return { loadState, retry, receiveAnswer }
}
