import { ApiTimeoutError, apiClient, readApiError, withApiTimeout } from '../../lib/api'
import type { FeedQuery } from './feedTypes'
import type { ListConcernsResponse } from '../../lib/api'

export type ListConcernsResult =
  | { ok: true; data: ListConcernsResponse }
  | { ok: false; status: number; code: string; message: string }

export async function listConcerns(query: FeedQuery = {}): Promise<ListConcernsResult> {
  try {
    const response = await withApiTimeout(() =>
      apiClient.api.v1.concerns.$get({
        query: {
          limit: String(query.limit ?? 20),
          sort: query.sort ?? 'newest',
          ...(query.cursor ? { cursor: query.cursor } : {}),
          ...(query.regionCode ? { regionCode: query.regionCode } : {}),
          ...(query.gender ? { gender: query.gender } : {}),
          ...(query.clusterId ? { clusterId: query.clusterId } : {}),
        },
      }),
    )

    if (response.ok) return { ok: true, data: await response.json() }

    const error = await readApiError(response)
    return {
      ok: false,
      status: response.status,
      code: error?.code ?? 'UNKNOWN_ERROR',
      message: error?.message ?? '投稿を読み込めませんでした。時間をおいて再試行してください',
    }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      code: error instanceof ApiTimeoutError ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR',
      message:
        error instanceof ApiTimeoutError
          ? '読み込みに時間がかかっています。時間をおいて再試行してください'
          : '投稿を読み込めませんでした。時間をおいて再試行してください',
    }
  }
}
