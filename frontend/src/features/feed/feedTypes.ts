import type { ListConcernsResponse } from '../../lib/api'
import type { RegionCode } from '../post/postTypes'

export type FeedItem = ListConcernsResponse['items'][number]

export type FeedStatus = 'idle' | 'loading' | 'loadingMore' | 'success' | 'error'

export const FEED_SORTS = ['newest', 'recommended'] as const
export type FeedSort = (typeof FEED_SORTS)[number]

export const RECOMMENDATION_REASON_LABELS = {
  unread_cluster: '未読のテーマ',
  new_cluster: '新しいテーマ',
  region_diversity: '地域の偏りを避けて',
  newest: '新着',
  fallback_newest: '新着順',
} as const

export interface FeedQuery {
  limit?: number
  cursor?: string
  sort?: FeedSort
  gender?: string
  regionCode?: RegionCode
  clusterId?: string
}
