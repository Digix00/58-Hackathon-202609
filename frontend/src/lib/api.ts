import { hc } from 'hono/client'
import type { InferResponseType } from 'hono'
import type { AppType } from 'backend'

// ローカル開発時はwrangler devのデフォルトポートに向ける。
// 本番/プレビューではデプロイ済みWorkersのURLを.envで上書きする。
const baseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8787'

export const apiClient = hc<AppType>(baseUrl, {
  init: { credentials: 'include' },
})

export type AuthResponse = InferResponseType<typeof apiClient.api.v1.auth.session.$get, 200>

export type DevAuthResponse = InferResponseType<typeof apiClient.api.v1.auth.dev.$post, 200>

export type CreateConcernResponse = InferResponseType<typeof apiClient.api.v1.concerns.$post, 201>

export type ListConcernsResponse = InferResponseType<typeof apiClient.api.v1.concerns.$get, 200>

export type ConcernDetailResponse = InferResponseType<
  (typeof apiClient.api.v1.concerns)[':concernId']['$get'],
  200
>

export type ConcernReactionResponse = Extract<
  InferResponseType<(typeof apiClient.api.v1.concerns)[':concernId']['reactions']['$post'], 201>,
  {
    concernId: string
    reactionType: 'empathy'
    reactionCount: number
    reacted: true
  }
>

export type RemoveConcernReactionResponse = Extract<
  InferResponseType<(typeof apiClient.api.v1.concerns)[':concernId']['reactions']['$delete'], 200>,
  {
    concernId: string
    reactionType: 'empathy'
    reactionCount: number
    reacted: false
  }
>

export type TodayQuizResponse = InferResponseType<typeof apiClient.api.v1.quizzes.today.$get, 200>

export type QuizByIdResponse = InferResponseType<
  (typeof apiClient.api.v1.quizzes)[':quizId']['$get'],
  200
>

export type QuizAnswerResponse = InferResponseType<
  (typeof apiClient.api.v1.quizzes)[':quizId']['answers']['$post'],
  201
>

export type HistorySummaryResponse = InferResponseType<
  typeof apiClient.api.v1.history.summary.$get,
  200
>

export type QuizAnswerHistoryResponse = InferResponseType<
  (typeof apiClient.api.v1.history)['quiz-answers']['$get'],
  200
>

/** 自分が書いた声の履歴。寄りそった声の履歴と同じ形で返る。 */
export type HistoryConcernsResponse = InferResponseType<
  typeof apiClient.api.v1.history.concerns.$get,
  200
>

export type HistoryReactionsResponse = InferResponseType<
  typeof apiClient.api.v1.history.reactions.$get,
  200
>

export const API_REQUEST_TIMEOUT_MS = 10_000

export class ApiTimeoutError extends Error {
  constructor() {
    super('API request timed out')
    this.name = 'ApiTimeoutError'
  }
}

export async function withApiTimeout<T>(
  request: () => Promise<T>,
  timeoutMs = API_REQUEST_TIMEOUT_MS,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new ApiTimeoutError()), timeoutMs)
  })

  try {
    return await Promise.race([request(), timeout])
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId)
  }
}

export async function readApiError(response: {
  json(): Promise<unknown>
}): Promise<{ code: string; message: string } | null> {
  try {
    const body = await response.json()
    if (typeof body !== 'object' || body === null) return null

    const error = (body as { error?: unknown }).error
    if (typeof error !== 'object' || error === null) return null

    const code = (error as { code?: unknown }).code
    const message = (error as { message?: unknown }).message
    if (typeof code !== 'string' || typeof message !== 'string') return null

    return { code, message }
  } catch {
    return null
  }
}
