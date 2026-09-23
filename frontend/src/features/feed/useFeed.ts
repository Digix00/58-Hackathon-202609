import { useCallback, useEffect, useReducer, useRef } from 'react'
import { listConcerns } from './feedApi'
import type { FeedItem, FeedStatus } from './feedTypes'

export interface UseFeedResult {
  status: FeedStatus
  items: FeedItem[]
  error: string | null
  refresh: () => Promise<void>
  retry: () => Promise<void>
}

type FeedState = {
  status: FeedStatus
  items: FeedItem[]
  error: string | null
}

type FeedAction =
  | { type: 'loadStarted' }
  | { type: 'loadSucceeded'; items: FeedItem[] }
  | { type: 'loadFailed'; message: string }

const initialFeedState: FeedState = { status: 'idle', items: [], error: null }

function feedReducer(state: FeedState, action: FeedAction): FeedState {
  switch (action.type) {
    case 'loadStarted':
      return { ...state, status: 'loading', error: null }
    case 'loadSucceeded':
      return { status: 'success', items: action.items, error: null }
    case 'loadFailed':
      return { status: 'error', items: [], error: action.message }
  }
}

/**
 * Intent: 投稿一覧の取得と loading / success / error の遷移を局所化する。
 * Boundary: 引数なしで一覧状態と再取得操作だけを公開し、API DTOはHook内に閉じ込める。
 * State modeling: reducerで一覧・状態・エラーを同時に更新し、不整合な組み合わせを防ぐ。
 * Update surface: refresh、retry。
 * Hidden complexity: 古いリクエストの結果を requestVersion で破棄する。
 * Composition: FeedのContainerから表示用状態として利用する。
 * Test notes: 初回取得、成功、失敗、再試行、古いレスポンスの破棄を確認する。
 */
export function useFeed(): UseFeedResult {
  const [state, dispatch] = useReducer(feedReducer, initialFeedState)
  const requestVersion = useRef(0)

  const refresh = useCallback(async (): Promise<void> => {
    const version = ++requestVersion.current

    dispatch({ type: 'loadStarted' })
    const result = await listConcerns()
    if (version !== requestVersion.current) return

    if (!result.ok) {
      dispatch({ type: 'loadFailed', message: result.message })
      return
    }

    dispatch({ type: 'loadSucceeded', items: result.data.items })
  }, [])

  const retry = useCallback(() => refresh(), [refresh])

  useEffect(() => {
    let active = true
    void Promise.resolve().then(() => {
      if (!active) return
      return refresh()
    })
    return () => {
      active = false
      requestVersion.current += 1
    }
  }, [refresh])

  return {
    status: state.status,
    items: state.items,
    error: state.error,
    refresh,
    retry,
  }
}
