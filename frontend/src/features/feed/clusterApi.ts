import { apiErrorMessage } from '../../i18n/translate'
import {
  ApiTimeoutError,
  apiClient,
  readApiError,
  withApiTimeout,
  type ListClustersResponse,
} from '../../lib/api'
import type { MessageKey } from '../../i18n/messages'
import type { FeedFilter } from './feedViewModel'

export type FeedTheme = Pick<ListClustersResponse['items'][number], 'id' | 'label' | 'summary'>
export type ThemeItem = ListClustersResponse['items'][number]

export async function listThemes(
  filter: FeedFilter,
  cursor?: string,
): Promise<{ ok: true; data: ListClustersResponse } | { ok: false; message: MessageKey }> {
  try {
    const response = await withApiTimeout(() =>
      apiClient.api.v1.clusters.$get({
        query: {
          limit: '4',
          ...(cursor ? { cursor } : {}),
          ...(filter.region ? { regionCode: filter.region } : {}),
          ...(filter.gender ? { gender: filter.gender } : {}),
        },
      }),
    )
    if (response.ok) return { ok: true, data: await response.json() }
    const error = await readApiError(response)
    return { ok: false, message: apiErrorMessage(error?.code, 'error.loadThemes') }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof ApiTimeoutError ? 'error.timeout' : 'error.network',
    }
  }
}
