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

async function sendRequest<TResponse>(send: () => Promise<TResponse>): Promise<TResponse> {
  try {
    return await withApiTimeout(send, 20_000)
  } catch (cause) {
    if (cause instanceof ApiTimeoutError) {
      throw new LineBroadcastApiError('REQUEST_TIMEOUT', 'broadcast.noResponse')
    }
    throw new LineBroadcastApiError('NETWORK_ERROR', 'broadcast.network')
  }
}
