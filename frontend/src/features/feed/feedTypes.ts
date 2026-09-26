import type { ListConcernsResponse } from '../../lib/api'
import type { Gender, RegionCode } from '../post/postTypes'
import type { DisplayLanguage } from '../../app/providers/DisplaySettingsContext'

export type FeedItem = ListConcernsResponse['items'][number]

export type FeedStatus = 'idle' | 'loading' | 'loadingMore' | 'success' | 'error'

export const FEED_SORTS = ['newest', 'recommended'] as const
export type FeedSort = (typeof FEED_SORTS)[number]

export const RECOMMENDATION_REASON_LABELS = {
  unread_cluster: 'history.unreadTheme',
  new_cluster: 'feed.newTheme',
  nearby_prefecture: 'feed.nearbyPrefecture',
  nearby_area: 'feed.nearbyArea',
  region_diversity: 'feed.regionDiversity',
  newest: 'feed.newest',
  fallback_newest: 'feed.newestFirst',
} as const

export interface FeedQuery {
  language?: DisplayLanguage
  limit?: number
  cursor?: string
  sort?: FeedSort
  gender?: Gender
  regionCode?: RegionCode
  clusterId?: string
}
