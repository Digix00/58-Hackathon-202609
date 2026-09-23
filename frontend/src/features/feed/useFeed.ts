import { useCallback, useEffect, useRef, useState } from 'react'
import { listConcerns } from './feedApi'
import type { FeedItem, FeedStatus } from './feedTypes'

export interface UseFeedResult {
  status: FeedStatus
  items: FeedItem[]
  error: string | null
  refresh: () => Promise<void>
  retry: () => Promise<void>
}

export function useFeed(): UseFeedResult {
  const [status, setStatus] = useState<FeedStatus>('idle')
  const [items, setItems] = useState<FeedItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const requestVersion = useRef(0)

  const refresh = useCallback(async (): Promise<void> => {
    const version = ++requestVersion.current
    setStatus('loading')
    setError(null)

    const result = await listConcerns()
    if (version !== requestVersion.current) return

    if (!result.ok) {
      setItems([])
      setError(result.message)
      setStatus('error')
      return
    }

    setItems(result.data.items)
    setStatus('success')
  }, [])

  const retry = useCallback(() => refresh(), [refresh])

  useEffect(() => {
    void refresh()
    return () => {
      requestVersion.current += 1
    }
  }, [refresh])

  return {
    status,
    items,
    error,
    refresh,
    retry,
  }
}
