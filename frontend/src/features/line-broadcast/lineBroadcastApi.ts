const baseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8787'

export type BroadcastStatus = 'not_started' | 'pending' | 'running' | 'succeeded' | 'failed'
export type DeliveryMode = 'line_api' | 'simulation'

export interface DailyBroadcastStatus {
  quizDate: string
  quizId: string | null
  quizStatus: 'missing' | 'published'
  broadcastStatus: BroadcastStatus
  deliveryMode: DeliveryMode
  requestedAt: string | null
  sentAt: string | null
  finishedAt: string | null
}

export class LineBroadcastApiError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'LineBroadcastApiError'
    this.code = code
  }
}

export async function getDailyBroadcastStatus(): Promise<DailyBroadcastStatus> {
  return request('/api/v1/admin/line/broadcasts/daily-quiz', { method: 'GET' })
}

export async function triggerDailyBroadcast(): Promise<DailyBroadcastStatus> {
  return request('/api/v1/admin/line/broadcasts/daily-quiz', {
    method: 'POST',
  })
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(new URL(path, baseUrl), {
      ...init,
      credentials: 'include',
      signal: AbortSignal.timeout(20_000),
    })
  } catch {
    throw new LineBroadcastApiError('NETWORK_ERROR', 'APIへ接続できませんでした。')
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new LineBroadcastApiError(
      'INVALID_RESPONSE',
      'APIの応答を読み取れませんでした。Cloudflare Accessのログイン状態を確認してください。',
    )
  }

  if (!response.ok) {
    const error = isRecord(body) && isRecord(body.error) ? body.error : null
    const code = error && typeof error.code === 'string' ? error.code : 'REQUEST_FAILED'
    const message =
      error && typeof error.message === 'string' ? error.message : '処理に失敗しました。'
    throw new LineBroadcastApiError(code, message)
  }
  return body as T
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
