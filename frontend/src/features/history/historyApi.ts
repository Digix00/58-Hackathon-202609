import { ApiTimeoutError, apiClient, readApiError, withApiTimeout } from '../../lib/api'
import type { HistorySummaryResponse, QuizAnswerHistoryResponse } from '../../lib/api'

export type HistoryApiResult<T> =
  { ok: true; data: T } | { ok: false; status: number; code: string; message: string }

export async function getHistorySummary(): Promise<HistoryApiResult<HistorySummaryResponse>> {
  try {
    const response = await withApiTimeout(() => apiClient.api.v1.history.summary.$get())
    if (response.ok) return { ok: true, data: await response.json() }

    const error = await readApiError(response)
    return {
      ok: false,
      status: response.status,
      code: error?.code ?? 'UNKNOWN_ERROR',
      message: error?.message ?? '学習履歴を読み込めませんでした。時間をおいて再試行してください',
    }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      code: error instanceof ApiTimeoutError ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR',
      message:
        error instanceof ApiTimeoutError
          ? '読み込みに時間がかかっています。時間をおいて再試行してください'
          : '学習履歴を読み込めませんでした。時間をおいて再試行してください',
    }
  }
}

export async function getQuizAnswerHistory(
  limit = 20,
  cursor?: string,
): Promise<HistoryApiResult<QuizAnswerHistoryResponse>> {
  try {
    const response = await withApiTimeout(() =>
      apiClient.api.v1.history['quiz-answers'].$get({
        query: { limit: String(limit), ...(cursor ? { cursor } : {}) },
      }),
    )
    if (response.ok) return { ok: true, data: await response.json() }

    const error = await readApiError(response)
    return {
      ok: false,
      status: response.status,
      code: error?.code ?? 'UNKNOWN_ERROR',
      message: error?.message ?? 'クイズ履歴を読み込めませんでした。時間をおいて再試行してください',
    }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      code: error instanceof ApiTimeoutError ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR',
      message:
        error instanceof ApiTimeoutError
          ? '読み込みに時間がかかっています。時間をおいて再試行してください'
          : 'クイズ履歴を読み込めませんでした。時間をおいて再試行してください',
    }
  }
}
