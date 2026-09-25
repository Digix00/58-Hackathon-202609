import { useCallback, useEffect, useRef, useState } from 'react'
import { appendQuizAnswers, toHistoryViewModel, type HistoryViewModel } from './historyViewModel'
import { getHistorySummary, getQuizAnswerHistory } from './historyApi'

export type HistoryStatus = 'loading' | 'success' | 'error'

export interface UseHistoryResult {
  status: HistoryStatus
  data: HistoryViewModel | null
  error: string | null
  isLoadingMore: boolean
  refresh: () => Promise<void>
  loadMoreQuizAnswers: () => Promise<void>
}

type HistoryFetchResult = { data: HistoryViewModel } | { error: string }

async function fetchHistoryData(): Promise<HistoryFetchResult> {
  const [summary, quizAnswers] = await Promise.all([getHistorySummary(), getQuizAnswerHistory()])

  if (!summary.ok) return { error: summary.message }
  if (!quizAnswers.ok) return { error: quizAnswers.message }

  return { data: toHistoryViewModel(summary.data, quizAnswers.data) }
}

export function useHistory(): UseHistoryResult {
  const [status, setStatus] = useState<HistoryStatus>('loading')
  const [data, setData] = useState<HistoryViewModel | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const requestVersion = useRef(0)

  const applyHistoryResult = useCallback((result: HistoryFetchResult) => {
    if ('error' in result) {
      setStatus('error')
      setError(result.error)
      return
    }

    setData(result.data)
    setStatus('success')
  }, [])

  const refresh = useCallback(async () => {
    const version = ++requestVersion.current
    setStatus('loading')
    setData(null)
    setError(null)
    setIsLoadingMore(false)

    const result = await fetchHistoryData()
    if (version !== requestVersion.current) return
    applyHistoryResult(result)
  }, [applyHistoryResult])

  const loadMoreQuizAnswers = useCallback(async () => {
    const cursor = data?.quizAnswersNextCursor
    if (!cursor || isLoadingMore) return

    const version = requestVersion.current
    setIsLoadingMore(true)
    setError(null)
    const result = await getQuizAnswerHistory(20, cursor)
    if (version !== requestVersion.current) return
    setIsLoadingMore(false)

    if (!result.ok) {
      setError(result.message)
      return
    }

    setData((current) => (current ? appendQuizAnswers(current, result.data) : current))
  }, [data?.quizAnswersNextCursor, isLoadingMore])

  useEffect(() => {
    const version = ++requestVersion.current
    let isCurrent = true
    void fetchHistoryData().then((result) => {
      if (isCurrent && version === requestVersion.current) {
        applyHistoryResult(result)
      }
    })
    return () => {
      isCurrent = false
      requestVersion.current += 1
    }
  }, [applyHistoryResult])

  return { status, data, error, isLoadingMore, refresh, loadMoreQuizAnswers }
}
