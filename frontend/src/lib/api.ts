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

export type CreateConcernResponse = InferResponseType<typeof apiClient.api.v1.concerns.$post, 201>

export type ListConcernsResponse = InferResponseType<typeof apiClient.api.v1.concerns.$get, 200>

export type ConcernDetailResponse = InferResponseType<
  (typeof apiClient.api.v1.concerns)[':concernId']['$get'],
  200
>

export const API_REQUEST_TIMEOUT_MS = 10_000

export class ApiTimeoutError extends Error {
  constructor() {
    super('API request timed out')
    this.name = 'ApiTimeoutError'
  }
}

export async function withApiTimeout<T>(request: () => Promise<T>): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new ApiTimeoutError()), API_REQUEST_TIMEOUT_MS)
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
