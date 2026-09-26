import { useCallback, useEffect, useReducer, useRef } from 'react'
import {
  useDisplaySettings,
  type DisplayLanguage,
} from '../../app/providers/DisplaySettingsContext'
import { getOwnConcernHistory, getReactedConcernHistory } from './historyApi'
import { toHistoryVoices, type HistoryVoiceView } from './historyViewModel'
import type { HistoryError } from './useHistory'

/** 書いた声と寄りそった声は、同じ形の一覧を別の並び順で読む。 */
export type HistoryVoiceSource = 'own' | 'supported'

export type HistoryVoicesStatus = 'idle' | 'loading' | 'loadingMore' | 'success' | 'error'

export interface UseHistoryVoicesResult {
  status: HistoryVoicesStatus
  voices: HistoryVoiceView[]
  hasMore: boolean
  error: HistoryError | null
  loadMore: () => Promise<void>
  retry: () => Promise<void>
}

const PAGE_SIZE = 10

interface VoicesState {
  status: HistoryVoicesStatus
  voices: HistoryVoiceView[]
  nextCursor: string | null
  error: HistoryError | null
  /** 読み込んだ一覧の表示言語。切り替わったら読み直す。 */
  loadedLanguage: DisplayLanguage | null
}

type VoicesAction =
  | { type: 'firstPageStarted'; language: DisplayLanguage }
  | { type: 'nextPageStarted' }
  | { type: 'loaded'; voices: HistoryVoiceView[]; nextCursor: string | null; append: boolean }
  | { type: 'failed'; error: HistoryError }

const initialState: VoicesState = {
  status: 'idle',
  voices: [],
  nextCursor: null,
  error: null,
  loadedLanguage: null,
}

function voicesReducer(state: VoicesState, action: VoicesAction): VoicesState {
  switch (action.type) {
    case 'firstPageStarted':
      return { ...initialState, status: 'loading', loadedLanguage: action.language }
    case 'nextPageStarted':
      return { ...state, status: 'loadingMore', error: null }
    case 'loaded':
      return {
        ...state,
        status: 'success',
        voices: action.append ? [...state.voices, ...action.voices] : action.voices,
        nextCursor: action.nextCursor,
        error: null,
      }
    case 'failed':
      // 続きの取得に失敗しても、読めている分は残す。
      return { ...state, status: state.voices.length ? 'success' : 'error', error: action.error }
  }
}

async function fetchVoices(
  source: HistoryVoiceSource,
  language: DisplayLanguage,
  cursor?: string,
): Promise<{ voices: HistoryVoiceView[]; nextCursor: string | null } | { error: HistoryError }> {
  const result =
    source === 'own'
      ? await getOwnConcernHistory(PAGE_SIZE, cursor)
      : await getReactedConcernHistory(PAGE_SIZE, cursor)
  if (!result.ok) {
    return { error: { status: result.status, code: result.code, message: result.message } }
  }

  return {
    voices: toHistoryVoices(result.data, language),
    nextCursor: result.data.nextCursor,
  }
}

/**
 * Intent: 履歴に並べる声の一覧取得とページ送りを、見出しごとに局所化する。
 * Boundary: 読む対象（書いた声・寄りそった声）と、開かれているかどうかだけを受け取る。
 * State modeling: 取得状態・一覧・続きの位置・エラーは互いに依存するため reducer で同時に更新する。
 * Update surface: loadMore、retry。
 * Hidden complexity: 開かれるまで取得しない、いちど読んだ一覧は見出しを往復しても保つ、言語が変わったら読み直す、古い応答を捨てる、続きの失敗で読めている分を消さない。
 * Composition: 履歴画面が見出しごとに呼び、表示用の ViewModel だけを受け取る。
 * Test notes: 未開封、初回取得、続き取得、失敗、言語変更後の読み直しを確認する。
 */
export function useHistoryVoices(
  source: HistoryVoiceSource,
  opened: boolean,
): UseHistoryVoicesResult {
  const { language } = useDisplaySettings()
  const [state, dispatch] = useReducer(voicesReducer, initialState)
  const requestVersion = useRef(0)

  const loadFirstPage = useCallback(async () => {
    const version = ++requestVersion.current
    dispatch({ type: 'firstPageStarted', language })
    const result = await fetchVoices(source, language)
    if (version !== requestVersion.current) return

    if ('error' in result) {
      dispatch({ type: 'failed', error: result.error })
      return
    }
    dispatch({ type: 'loaded', ...result, append: false })
  }, [language, source])

  useEffect(() => {
    // 開いたときに初回だけ読み、閉じている間に言語が変わった場合は次に開いたときへ回す。
    if (!opened) return
    if (state.status !== 'idle' && state.loadedLanguage === language) return
    void loadFirstPage()
  }, [language, loadFirstPage, opened, state.loadedLanguage, state.status])

  const loadMore = useCallback(async () => {
    if (state.status !== 'success' || !state.nextCursor) return

    const version = ++requestVersion.current
    dispatch({ type: 'nextPageStarted' })
    const result = await fetchVoices(source, language, state.nextCursor)
    if (version !== requestVersion.current) return

    if ('error' in result) {
      dispatch({ type: 'failed', error: result.error })
      return
    }
    dispatch({ type: 'loaded', ...result, append: true })
  }, [language, source, state.nextCursor, state.status])

  return {
    status: state.status,
    voices: state.voices,
    hasMore: Boolean(state.nextCursor),
    error: state.error,
    loadMore,
    retry: loadFirstPage,
  }
}
