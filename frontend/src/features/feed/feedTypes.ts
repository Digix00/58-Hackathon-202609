import type { ListConcernsResponse } from '../../lib/api'
import type { Gender, RegionCode } from '../post/postTypes'

export type FeedItem = ListConcernsResponse['items'][number]

export type FeedStatus = 'idle' | 'loading' | 'loadingMore' | 'success' | 'error'

export const FEED_SORTS = ['newest', 'recommended'] as const
export type FeedSort = (typeof FEED_SORTS)[number]

export const RECOMMENDATION_REASON_LABELS = {
  familiar_theme: '最近読んだテーマの、別の声',
  discovery: 'まだ出会っていない声',
  less_heard: 'まだ届いていない声',
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
  gender?: Gender
  regionCode?: RegionCode
  clusterId?: string
}
