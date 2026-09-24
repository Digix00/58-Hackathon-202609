import { useEffect, useRef } from 'react'
import { useRuntime } from '../../app/providers/RuntimeContext'
import { recordConcernView } from './concernViewApi'

export function useConcernViewOnDisplay(concernId: string | undefined, enabled = true): void {
  const { state } = useRuntime()
  const recordedConcernIds = useRef(new Set<string>())

  useEffect(() => {
    if (
      !concernId ||
      !enabled ||
      state.status !== 'ready' ||
      state.mode !== 'liff' ||
      recordedConcernIds.current.has(concernId)
    ) {
      return
    }

    recordedConcernIds.current.add(concernId)
    void recordConcernView(concernId)
  }, [concernId, enabled, state])
}
