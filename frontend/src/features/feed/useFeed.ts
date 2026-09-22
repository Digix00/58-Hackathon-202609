import { useCallback, useEffect, useRef, useState } from 'react'
import { listConcerns } from './feedApi'
import type { FeedItem, FeedStatus } from './feedTypes'

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

export function useFeed(limit = 20): UseFeedResult {
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
    setStatus('loading')
    setError(null)

    const result = await listConcerns({ limit })
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
  }, [limit])

  const loadMore = useCallback(async (): Promise<void> => {
    const cursor = cursorRef.current
    if (isLoading.current || !cursor) return

    const version = requestVersion.current
    isLoading.current = true
    setStatus('loadingMore')
    setError(null)

    const result = await listConcerns({ limit, cursor })
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
  }, [limit])

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
