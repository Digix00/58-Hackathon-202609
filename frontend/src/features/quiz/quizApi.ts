import { apiErrorMessage } from '../../i18n/translate'
import { ApiTimeoutError, apiClient, readApiError, withApiTimeout } from '../../lib/api'
import type { QuizAnswerResponse, QuizByIdResponse, TodayQuizResponse } from '../../lib/api'
import type { DisplayLanguage } from '../../app/providers/DisplaySettingsContext'

export type QuizApiResult<T> =
  { ok: true; data: T } | { ok: false; status: number; code: string; message: string }

export type QuizMatch = { participantId: string; concernId: string }

type QuizAnswerRpc = (typeof apiClient.api.v1.quizzes)[':quizId']['answers']['$post']
type QuizAnswerRequest = {
  param: { quizId: string }
  json: { matches: QuizMatch[] }
}

export async function getTodayQuiz(
  language: DisplayLanguage = 'original',
): Promise<QuizApiResult<TodayQuizResponse>> {
  try {
    const response = await withApiTimeout(() =>
      apiClient.api.v1.quizzes.today.$get({ query: { language } }),
    )

    if (response.ok) return { ok: true, data: await response.json() }

    const error = await readApiError(response)
    return {
      ok: false,
      status: response.status,
      code: error?.code ?? 'UNKNOWN_ERROR',
      message: apiErrorMessage(error?.code, 'error.todayQuiz'),
    }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      code: error instanceof ApiTimeoutError ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR',
      message: error instanceof ApiTimeoutError ? 'error.timeout' : 'error.todayQuiz',
    }
  }
}

export async function getQuizById(
  quizId: string,
  language: DisplayLanguage = 'original',
): Promise<QuizApiResult<QuizByIdResponse>> {
  try {
    const request = { param: { quizId }, query: { language } }
    const response = await withApiTimeout(() => apiClient.api.v1.quizzes[':quizId'].$get(request))

    if (response.ok) return { ok: true, data: await response.json() }

    const error = await readApiError(response)
    return {
      ok: false,
      status: response.status,
      code: error?.code ?? 'UNKNOWN_ERROR',
      message: apiErrorMessage(error?.code, 'error.quiz'),
    }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      code: error instanceof ApiTimeoutError ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR',
      message: error instanceof ApiTimeoutError ? 'error.timeout' : 'error.quiz',
    }
  }
}

export async function answerQuiz(
  quizId: string,
  matches: QuizMatch[],
): Promise<QuizApiResult<QuizAnswerResponse>> {
  try {
    // QuizHandler validates this documented body manually, so AppType cannot infer its input shape.
    const postAnswer = apiClient.api.v1.quizzes[':quizId'].answers.$post as unknown as (
      request: QuizAnswerRequest,
    ) => ReturnType<QuizAnswerRpc>
    const response = await withApiTimeout(() =>
      postAnswer({
        param: { quizId },
        json: { matches },
      }),
    )

    if (response.ok) return { ok: true, data: await response.json() }

    const error = await readApiError(response)
    return {
      ok: false,
      status: response.status,
      code: error?.code ?? 'UNKNOWN_ERROR',
      message: apiErrorMessage(error?.code, 'error.answer'),
    }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      code: error instanceof ApiTimeoutError ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR',
      message: error instanceof ApiTimeoutError ? 'error.answerUnknown' : 'error.answer',
    }
  }
}
