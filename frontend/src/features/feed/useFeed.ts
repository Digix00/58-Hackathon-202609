import { useCallback, useEffect, useReducer, useRef } from 'react'
import { listConcerns } from './feedApi'
import type { FeedItem, FeedQuery, FeedStatus } from './feedTypes'

export type UseFeedOptions = Omit<FeedQuery, 'cursor'> & {
  enabled?: boolean
  authUserId?: string
}

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

type FeedState = {
  status: FeedStatus
  items: FeedItem[]
  nextCursor: string | null
  error: string | null
}

type FeedAction =
  | { type: 'loadStarted' }
  | { type: 'loadSucceeded'; items: FeedItem[]; nextCursor: string | null }
  | { type: 'loadMoreStarted' }
  | { type: 'loadMoreSucceeded'; items: FeedItem[]; nextCursor: string | null }
  | { type: 'loadFailed'; message: string; preserveItems?: boolean }

const initialFeedState: FeedState = {
  status: 'idle',
  items: [],
  nextCursor: null,
  error: null,
}

function feedReducer(state: FeedState, action: FeedAction): FeedState {
  switch (action.type) {
    case 'loadStarted':
      return { ...initialFeedState, status: 'loading' }
    case 'loadSucceeded':
      return {
        status: 'success',
        items: action.items,
        nextCursor: action.nextCursor,
        error: null,
      }
    case 'loadMoreStarted':
      return { ...state, status: 'loadingMore', error: null }
    case 'loadMoreSucceeded':
      return {
        status: 'success',
        items: [...state.items, ...action.items],
        nextCursor: action.nextCursor,
        error: null,
      }
    case 'loadFailed':
      return {
        ...state,
        status: 'error',
        items: action.preserveItems ? state.items : [],
        nextCursor: action.preserveItems ? state.nextCursor : null,
        error: action.message,
      }
  }
}

/**
 * Intent: 投稿一覧の取得と loading / success / error の遷移を局所化する。
 * Boundary: 一覧状態と再取得・追加取得操作だけを公開し、API DTOはHook内に閉じ込める。
 * State modeling: reducerで一覧・カーソル・状態・エラーを同時に更新し、不整合な組み合わせを防ぐ。
 * Update surface: refresh、loadMore、retry。
 * Hidden complexity: 古いリクエストの結果を requestVersion で破棄する。
 * Composition: FeedのContainerから表示用状態として利用する。
 * Test notes: 初回取得、追加取得、成功、失敗、再試行、古いレスポンスの破棄を確認する。
 */
export function useFeed(options: UseFeedOptions | number = {}): UseFeedResult {
  const limit = typeof options === 'number' ? options : (options.limit ?? 20)
  const sort = typeof options === 'number' ? 'newest' : (options.sort ?? 'newest')
  const gender = typeof options === 'number' ? undefined : options.gender
  const regionCode = typeof options === 'number' ? undefined : options.regionCode
  const clusterId = typeof options === 'number' ? undefined : options.clusterId
  const enabled = typeof options === 'number' ? true : (options.enabled ?? true)
  const authUserId = typeof options === 'number' ? undefined : options.authUserId
  const language = typeof options === 'number' ? 'original' : (options.language ?? 'original')
  const [state, dispatch] = useReducer(feedReducer, initialFeedState)
  const requestVersion = useRef(0)
  const isLoading = useRef(false)
  const cursorRef = useRef<string | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    if (!enabled) return

    const version = ++requestVersion.current
    isLoading.current = true
    cursorRef.current = null
    dispatch({ type: 'loadStarted' })

    const result = await listConcerns({ limit, sort, gender, regionCode, clusterId, language })
    if (version !== requestVersion.current) return

    isLoading.current = false
    if (!result.ok) {
      dispatch({ type: 'loadFailed', message: result.message })
      return
    }

    cursorRef.current = result.data.nextCursor
    dispatch({
      type: 'loadSucceeded',
      items: result.data.items,
      nextCursor: result.data.nextCursor,
    })
  }, [clusterId, enabled, gender, limit, regionCode, sort, language])

  const loadMore = useCallback(async (): Promise<void> => {
    if (!enabled) return

    const cursor = cursorRef.current
    if (isLoading.current || !cursor) return

    const version = requestVersion.current
    isLoading.current = true
    dispatch({ type: 'loadMoreStarted' })

    const result = await listConcerns({
      limit,
      cursor,
      sort,
      gender,
      regionCode,
      clusterId,
      language,
    })
    if (version !== requestVersion.current) return

    isLoading.current = false
    if (!result.ok) {
      dispatch({ type: 'loadFailed', message: result.message, preserveItems: true })
      return
    }

    cursorRef.current = result.data.nextCursor
    dispatch({
      type: 'loadMoreSucceeded',
      items: result.data.items,
      nextCursor: result.data.nextCursor,
    })
  }, [clusterId, enabled, gender, limit, regionCode, sort, language])

  const retry = useCallback(() => refresh(), [refresh])

  useEffect(() => {
    if (!enabled) return

    let active = true
    void Promise.resolve().then(() => {
      if (!active) return
      return refresh()
    })
    return () => {
      active = false
      requestVersion.current += 1
      isLoading.current = false
    }
  }, [authUserId, enabled, refresh])

  return {
    status: state.status,
    items: state.items,
    nextCursor: state.nextCursor,
    hasMore: state.nextCursor !== null,
    error: state.error,
    refresh,
    loadMore,
    retry,
  }
}
