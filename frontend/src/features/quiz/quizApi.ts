import { ApiTimeoutError, apiClient, readApiError, withApiTimeout } from '../../lib/api'
import type { QuizAnswerResponse, QuizByIdResponse, TodayQuizResponse } from '../../lib/api'

export type QuizApiResult<T> =
  { ok: true; data: T } | { ok: false; status: number; code: string; message: string }

export type QuizMatch = { participantId: string; concernId: string }

type QuizAnswerRpc = (typeof apiClient.api.v1.quizzes)[':quizId']['answers']['$post']
type QuizAnswerRequest = {
  param: { quizId: string }
  json: { matches: QuizMatch[] }
}

export async function getTodayQuiz(): Promise<QuizApiResult<TodayQuizResponse>> {
  try {
    const response = await withApiTimeout(() =>
      apiClient.api.v1.quizzes.today.$get({ query: { language: 'original' } }),
    )

    if (response.ok) return { ok: true, data: await response.json() }

    const error = await readApiError(response)
    return {
      ok: false,
      status: response.status,
      code: error?.code ?? 'UNKNOWN_ERROR',
      message:
        error?.message ?? '今日のクイズを読み込めませんでした。時間をおいて再試行してください',
    }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      code: error instanceof ApiTimeoutError ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR',
      message:
        error instanceof ApiTimeoutError
          ? '読み込みに時間がかかっています。時間をおいて再試行してください'
          : '今日のクイズを読み込めませんでした。時間をおいて再試行してください',
    }
  }
}

export async function getQuizById(quizId: string): Promise<QuizApiResult<QuizByIdResponse>> {
  try {
    const response = await withApiTimeout(() =>
      apiClient.api.v1.quizzes[':quizId'].$get({
        param: { quizId },
      }),
    )

    if (response.ok) return { ok: true, data: await response.json() }

    const error = await readApiError(response)
    return {
      ok: false,
      status: response.status,
      code: error?.code ?? 'UNKNOWN_ERROR',
      message: error?.message ?? 'クイズを読み込めませんでした。時間をおいて再試行してください',
    }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      code: error instanceof ApiTimeoutError ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR',
      message:
        error instanceof ApiTimeoutError
          ? '読み込みに時間がかかっています。時間をおいて再試行してください'
          : 'クイズを読み込めませんでした。時間をおいて再試行してください',
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
      message: error?.message ?? '回答を送信できませんでした。時間をおいて再試行してください',
    }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      code: error instanceof ApiTimeoutError ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR',
      message:
        error instanceof ApiTimeoutError
          ? '送信結果を確認できません。時間をおいて再試行してください'
          : '回答を送信できませんでした。時間をおいて再試行してください',
    }
  }
}
