import { useCallback, useEffect, useRef, useState } from 'react'
import { getConcernDetail } from './concernDetailApi'
import type { ConcernDetail, ConcernDetailStatus } from './concernDetailTypes'
import { useConcernViewOnDisplay } from './useConcernViewOnDisplay'

export interface UseConcernDetailResult {
  status: ConcernDetailStatus
  concern: ConcernDetail | null
  error: string | null
  retry: () => Promise<void>
}

export function useConcernDetail(id: string | undefined): UseConcernDetailResult {
  const [status, setStatus] = useState<ConcernDetailStatus>('idle')
  const [concern, setConcern] = useState<ConcernDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const requestVersion = useRef(0)

  useConcernViewOnDisplay(
    status === 'success' && concern && concern.id === id ? concern.id : undefined,
  )

  const load = useCallback(async (): Promise<void> => {
    const version = ++requestVersion.current
    if (!id) {
      setConcern(null)
      setError('投稿が指定されていません')
      setStatus('error')
      return
    }

    setStatus('loading')
    setError(null)
    const result = await getConcernDetail(id)
    if (version !== requestVersion.current) return

    if (!result.ok) {
      setConcern(null)
      setError(result.message)
      setStatus('error')
      return
    }

    setConcern(result.data)
    setStatus('success')
  }, [id])

  useEffect(() => {
    void load()
    return () => {
      requestVersion.current += 1
    }
  }, [load])

  return { status, concern, error, retry: load }
}
