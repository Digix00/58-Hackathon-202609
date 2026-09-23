import type { ListConcernsResponse } from '../../lib/api'

export type FeedItem = ListConcernsResponse['items'][number]

export type FeedStatus = 'idle' | 'loading' | 'loadingMore' | 'success' | 'error'

export interface FeedQuery {
  limit?: number
  cursor?: string
}
