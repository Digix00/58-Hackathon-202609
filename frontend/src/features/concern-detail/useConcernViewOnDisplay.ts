import { useEffect, useRef } from 'react'
import { useRuntime } from '../../app/providers/RuntimeContext'
import { recordConcernView } from './concernViewApi'

export function useConcernViewOnDisplay(concernId: string | undefined): void {
  const { state } = useRuntime()
  const recordedConcernIds = useRef(new Set<string>())

  useEffect(() => {
    if (
      !concernId ||
      state.status !== 'ready' ||
      state.mode !== 'liff' ||
      recordedConcernIds.current.has(concernId)
    ) {
      return
    }

    recordedConcernIds.current.add(concernId)
    void recordConcernView(concernId)
  }, [concernId, state])
}
