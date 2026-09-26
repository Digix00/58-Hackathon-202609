import { apiClient, readApiError, withApiTimeout, type ListClustersResponse } from '../../lib/api'
import type { FeedFilter } from './feedViewModel'

export type FeedTheme = Pick<ListClustersResponse['items'][number], 'id' | 'label' | 'summary'>
export type ThemeItem = ListClustersResponse['items'][number]

export async function listThemes(
  filter: FeedFilter,
  cursor?: string,
): Promise<{ ok: true; data: ListClustersResponse } | { ok: false; message: string }> {
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
    return { ok: false, message: error?.message ?? 'テーマを読み込めませんでした。' }
  } catch {
    return {
      ok: false,
      message: 'テーマを読み込めませんでした。時間をおいて、もう一度お試しください。',
    }
  }
}
