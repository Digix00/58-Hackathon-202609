import { useEffect, useReducer } from 'react'
import { listThemes, type ThemeItem } from './clusterApi'
import type { FeedFilter } from './feedViewModel'

type ThemeState = {
  status: 'loading' | 'success' | 'error'
  items: ThemeItem[]
  nextCursor: string | null
  cursors: Array<string | undefined>
  attempt: number
  error: string | null
}
type ThemeAction =
  | { type: 'loaded'; items: ThemeItem[]; nextCursor: string | null }
  | { type: 'failed'; message: string }
  | { type: 'next' | 'previous' | 'retry' }

function reducer(state: ThemeState, action: ThemeAction): ThemeState {
  switch (action.type) {
    case 'loaded':
      return {
        ...state,
        status: 'success',
        items: action.items,
        nextCursor: action.nextCursor,
        error: null,
      }
    case 'failed':
      return { ...state, status: 'error', error: action.message }
    case 'next':
      return state.nextCursor
        ? {
            ...state,
            status: 'loading',
            cursors: [...state.cursors, state.nextCursor],
            error: null,
          }
        : state
    case 'previous':
      return state.cursors.length > 1
        ? { ...state, status: 'loading', cursors: state.cursors.slice(0, -1), error: null }
        : state
    case 'retry':
      return { ...state, status: 'loading', attempt: state.attempt + 1, error: null }
  }
}

/** 目次を4テーマずつ取得する。ページ変更・再試行後の古い応答は採用しない。 */
export function useFeedThemes(filter: FeedFilter) {
  const [state, dispatch] = useReducer(reducer, {
    status: 'loading',
    items: [],
    nextCursor: null,
    cursors: [undefined],
    attempt: 0,
    error: null,
  })
  const cursor = state.cursors.at(-1)
  const { region, gender } = filter
  useEffect(() => {
    let active = true
    void listThemes({ region, gender }, cursor).then((result) => {
      if (!active) return
      dispatch(
        result.ok
          ? { type: 'loaded', ...result.data }
          : { type: 'failed', message: result.message },
      )
    })
    return () => {
      active = false
    }
  }, [cursor, region, gender, state.attempt])

  return { ...state, dispatch }
}
