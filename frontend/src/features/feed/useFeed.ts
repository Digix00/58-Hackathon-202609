import { useCallback, useEffect, useRef, useState } from 'react'
import { listConcerns } from './feedApi'
import type { FeedItem, FeedQuery, FeedStatus } from './feedTypes'

export type UseFeedOptions = Omit<FeedQuery, 'cursor'>

export interface UseFeedResult {
  status: FeedStatus
  items: FeedItem[]
  nextCursor: string | null
  hasMore: boolean
  error: string | null
  refresh: () => Promise<void>
  loadMore: () => Promise<void>
  retry: () => Promise<void>
}

export function useFeed(options: UseFeedOptions | number = {}): UseFeedResult {
  const limit = typeof options === 'number' ? options : (options.limit ?? 20)
  const sort = typeof options === 'number' ? 'newest' : (options.sort ?? 'newest')
  const regionCode = typeof options === 'number' ? undefined : options.regionCode
  const clusterId = typeof options === 'number' ? undefined : options.clusterId
  const [status, setStatus] = useState<FeedStatus>('idle')
  const [items, setItems] = useState<FeedItem[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const requestVersion = useRef(0)
  const isLoading = useRef(false)
  const cursorRef = useRef<string | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    const version = ++requestVersion.current
    isLoading.current = true
    cursorRef.current = null
    setItems([])
    setNextCursor(null)
    setStatus('loading')
    setError(null)

    const result = await listConcerns({ limit, sort, regionCode, clusterId })
    if (version !== requestVersion.current) return

    isLoading.current = false
    if (!result.ok) {
      setItems([])
      setNextCursor(null)
      setError(result.message)
      setStatus('error')
      return
    }

    cursorRef.current = result.data.nextCursor
    setItems(result.data.items)
    setNextCursor(result.data.nextCursor)
    setStatus('success')
  }, [clusterId, limit, regionCode, sort])

  const loadMore = useCallback(async (): Promise<void> => {
    const cursor = cursorRef.current
    if (isLoading.current || !cursor) return

    const version = requestVersion.current
    isLoading.current = true
    setStatus('loadingMore')
    setError(null)

    const result = await listConcerns({ limit, cursor, sort, regionCode, clusterId })
    if (version !== requestVersion.current) return

    isLoading.current = false
    if (!result.ok) {
      setError(result.message)
      setStatus('error')
      return
    }

    cursorRef.current = result.data.nextCursor
    setItems((current) => [...current, ...result.data.items])
    setNextCursor(result.data.nextCursor)
    setStatus('success')
  }, [clusterId, limit, regionCode, sort])

  const retry = useCallback(() => refresh(), [refresh])

  useEffect(() => {
    void refresh()
    return () => {
      requestVersion.current += 1
      isLoading.current = false
    }
  }, [refresh])

  return {
    status,
    items,
    nextCursor,
    hasMore: nextCursor !== null,
    error,
    refresh,
    loadMore,
    retry,
  }
}
