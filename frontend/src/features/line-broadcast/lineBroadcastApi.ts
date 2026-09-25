import type { InferResponseType } from 'hono'
import { ApiTimeoutError, apiClient, readApiError, withApiTimeout } from '../../lib/api'

const dailyQuizBroadcast = apiClient.api.v1.admin.line.broadcasts['daily-quiz']

export type DailyBroadcastStatus = InferResponseType<typeof dailyQuizBroadcast.$get, 200>
export type BroadcastStatus = DailyBroadcastStatus['broadcastStatus']
export type DeliveryMode = DailyBroadcastStatus['deliveryMode']

export class LineBroadcastApiError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'LineBroadcastApiError'
    this.code = code
  }
}

export async function getDailyBroadcastStatus(): Promise<DailyBroadcastStatus> {
  const response = await sendRequest(() =>
    dailyQuizBroadcast.$get(undefined, {
      init: { signal: AbortSignal.timeout(20_000) },
    }),
  )
  if (!response.ok) {
    const error = await readApiError(response)
    throw new LineBroadcastApiError(
      error?.code ?? 'REQUEST_FAILED',
      error?.message ?? '処理に失敗しました。Cloudflare Accessのログイン状態を確認してください。',
    )
  }
  return readStatus(response)
}

export async function triggerDailyBroadcast(): Promise<void> {
  const response = await sendRequest(() =>
    dailyQuizBroadcast.$post(undefined, {
      init: { signal: AbortSignal.timeout(20_000) },
    }),
  )
  if (!response.ok) {
    const error = await readApiError(response)
    throw new LineBroadcastApiError(
      error?.code ?? 'REQUEST_FAILED',
      error?.message ?? '処理に失敗しました。Cloudflare Accessのログイン状態を確認してください。',
    )
  }
}

async function readStatus(
  response: { json(): Promise<DailyBroadcastStatus> },
): Promise<DailyBroadcastStatus> {
  try {
    return await response.json()
  } catch {
    throw new LineBroadcastApiError(
      'INVALID_RESPONSE',
      'APIの応答を読み取れませんでした。Cloudflare Accessのログイン状態を確認してください。',
    )
  }
}

async function sendRequest<TResponse>(send: () => Promise<TResponse>): Promise<TResponse> {
  try {
    return await withApiTimeout(send, 20_000)
  } catch (cause) {
    if (cause instanceof ApiTimeoutError) {
      throw new LineBroadcastApiError('REQUEST_TIMEOUT', 'APIの応答を確認できませんでした。')
    }
    throw new LineBroadcastApiError('NETWORK_ERROR', 'APIへ接続できませんでした。')
  }
}
