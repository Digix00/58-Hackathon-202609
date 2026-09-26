import type { InferResponseType } from 'hono'
import { apiErrorMessage } from '../../i18n/translate'
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
      apiErrorMessage(error?.code, 'broadcast.requestFailed'),
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
      apiErrorMessage(error?.code, 'broadcast.requestFailed'),
    )
  }
}

async function readStatus(response: {
  json(): Promise<DailyBroadcastStatus>
}): Promise<DailyBroadcastStatus> {
  try {
    return await response.json()
  } catch {
    throw new LineBroadcastApiError('INVALID_RESPONSE', 'broadcast.invalidResponse')
  }
}

async function sendRequest<TResponse>(
  send: () => Promise<TResponse>,
  timeoutMilliseconds = 20_000,
): Promise<TResponse> {
  try {
    return await withApiTimeout(send, timeoutMilliseconds)
  } catch (cause) {
    if (cause instanceof ApiTimeoutError) {
      throw new LineBroadcastApiError('REQUEST_TIMEOUT', 'broadcast.noResponse')
    }
    throw new LineBroadcastApiError('NETWORK_ERROR', 'broadcast.network')
  }
}

const reactionDigest = apiClient.api.v1.admin.line.notifications['reaction-digest']

export type ReactionDigestStatus = InferResponseType<typeof reactionDigest.$get, 200>
export type ReactionDigestRun = ReactionDigestStatus['runs'][number]

export async function getReactionDigestStatus(): Promise<ReactionDigestStatus> {
  const response = await sendRequest(() =>
    reactionDigest.$get(undefined, {
      init: { signal: AbortSignal.timeout(20_000) },
    }),
  )
  if (!response.ok) {
    const error = await readApiError(response)
    throw new LineBroadcastApiError(
      error?.code ?? 'REQUEST_FAILED',
      apiErrorMessage(error?.code, 'broadcast.requestFailed'),
    )
  }
  try {
    return await response.json()
  } catch {
    throw new LineBroadcastApiError('INVALID_RESPONSE', 'broadcast.invalidResponse')
  }
}

/** 寄りそい通知を今すぐ送る。未完了の実行があれば、その続きを送る。 */
export async function triggerReactionDigest(): Promise<void> {
  // 一回の実行でLINEへ複数件送るため、状態取得より長く待つ。
  const response = await sendRequest(
    () =>
      reactionDigest.$post(undefined, {
        init: { signal: AbortSignal.timeout(60_000) },
      }),
    60_000,
  )
  if (!response.ok) {
    const error = await readApiError(response)
    throw new LineBroadcastApiError(
      error?.code ?? 'REQUEST_FAILED',
      apiErrorMessage(error?.code, 'broadcast.requestFailed'),
    )
  }
}
