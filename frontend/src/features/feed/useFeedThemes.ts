import { useEffect, useReducer } from 'react'
import type { MessageKey } from '../../i18n/messages'
import { listThemes, type ThemeItem } from './clusterApi'
import type { FeedFilter } from './feedViewModel'

type ThemeState = {
  status: 'loading' | 'success' | 'error'
  items: ThemeItem[]
  attempt: number
  error: MessageKey | null
}
type ThemeAction =
  | { type: 'loaded'; items: ThemeItem[] }
  | { type: 'failed'; message: MessageKey }
  | { type: 'retry' }

function reducer(state: ThemeState, action: ThemeAction): ThemeState {
  switch (action.type) {
    case 'loaded':
      return { ...state, status: 'success', items: action.items, error: null }
    case 'failed':
      return { ...state, status: 'error', error: action.message }
    case 'retry':
      return { ...state, status: 'loading', attempt: state.attempt + 1, error: null }
  }
}

/**
 * 読むテーマの選択肢。
 *
 * 性別・地域と同じ条件として選ぶので、ページ送りは持たず一度に読み込む。
 * 条件を変えたら取り直す。古い条件の応答は採用しない。
 */
export function useFeedThemes(filter: FeedFilter) {
  const [state, dispatch] = useReducer(reducer, {
    status: 'loading',
    items: [],
    attempt: 0,
    error: null,
  })
  const { region, gender } = filter
  useEffect(() => {
    let active = true
    void listThemes({ region, gender }).then((result) => {
      if (!active) return
      dispatch(
        result.ok
          ? { type: 'loaded', items: result.data.items }
          : { type: 'failed', message: result.message },
      )
    })
    return () => {
      active = false
    }
  }, [region, gender, state.attempt])

  return { ...state, retry: () => dispatch({ type: 'retry' }) }
}
