import { useCallback, useEffect, useReducer, useRef } from 'react'
import { getConcernDetail } from './concernDetailApi'
import type { ConcernDetail, ConcernDetailStatus } from './concernDetailTypes'
import { useConcernViewOnDisplay } from './useConcernViewOnDisplay'

export interface UseConcernDetailResult {
  status: ConcernDetailStatus
  concern: ConcernDetail | null
  error: string | null
  retry: () => Promise<void>
}

type ConcernDetailState = {
  status: ConcernDetailStatus
  concern: ConcernDetail | null
  error: string | null
}

type ConcernDetailAction =
  | { type: 'loadStarted' }
  | { type: 'loadSucceeded'; concern: ConcernDetail }
  | { type: 'loadFailed'; message: string }

const initialConcernDetailState: ConcernDetailState = {
  status: 'idle',
  concern: null,
  error: null,
}

function concernDetailReducer(
  state: ConcernDetailState,
  action: ConcernDetailAction,
): ConcernDetailState {
  switch (action.type) {
    case 'loadStarted':
      return { ...state, status: 'loading', error: null }
    case 'loadSucceeded':
      return { status: 'success', concern: action.concern, error: null }
    case 'loadFailed':
      return { status: 'error', concern: null, error: action.message }
  }
}

/**
 * Intent: 投稿詳細の取得と loading / success / error の遷移を局所化する。
 * Boundary: 投稿IDを受け取り、詳細状態と再試行操作だけを公開する。
 * State modeling: reducerで詳細・状態・エラーを同時に更新し、ID変更時の古い結果を破棄する。
 * Update surface: retry。
 * Hidden complexity: undefinedのIDと非同期レスポンスの競合をHook内で扱う。
 * Composition: 詳細画面のContainerから表示用状態として利用する。
 * Test notes: IDなし、成功、失敗、ID変更中の古いレスポンスを確認する。
 */
export function useConcernDetail(id: string | undefined): UseConcernDetailResult {
  const [state, dispatch] = useReducer(concernDetailReducer, initialConcernDetailState)
  const requestVersion = useRef(0)

  useConcernViewOnDisplay(
    state.status === 'success' && state.concern && state.concern.id === id
      ? state.concern.id
      : undefined,
  )

  const load = useCallback(async (): Promise<void> => {
    const version = ++requestVersion.current
    if (!id) {
      dispatch({ type: 'loadFailed', message: '投稿が指定されていません' })
      return
    }

    dispatch({ type: 'loadStarted' })
    const result = await getConcernDetail(id)
    if (version !== requestVersion.current) return

    if (!result.ok) {
      dispatch({ type: 'loadFailed', message: result.message })
      return
    }

    dispatch({ type: 'loadSucceeded', concern: result.data })
  }, [id])

  useEffect(() => {
    let active = true
    void Promise.resolve().then(() => {
      if (!active) return
      return load()
    })
    return () => {
      requestVersion.current += 1
      active = false
    }
  }, [load])

  return { status: state.status, concern: state.concern, error: state.error, retry: load }
}
