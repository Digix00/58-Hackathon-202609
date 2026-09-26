import { apiErrorMessage } from '../../i18n/translate'
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
          language: query.language ?? 'original',
          ...(query.cursor ? { cursor: query.cursor } : {}),
          ...(query.gender ? { gender: query.gender } : {}),
          ...(query.regionCode ? { regionCode: query.regionCode } : {}),
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
      message: apiErrorMessage(error?.code, 'error.loadConcern'),
    }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      code: error instanceof ApiTimeoutError ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR',
      message: error instanceof ApiTimeoutError ? 'error.timeout' : 'error.loadConcern',
    }
  }
}
