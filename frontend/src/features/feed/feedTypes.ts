import type { ListConcernsResponse } from '../../lib/api'

export type FeedItem = ListConcernsResponse['items'][number]

export type FeedStatus = 'idle' | 'loading' | 'success' | 'error'
