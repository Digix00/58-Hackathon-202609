import { useEffect, useRef } from 'react'
import { useAuth } from '../../auth/useAuth'
import { useRuntime } from '../../app/providers/RuntimeContext'
import { recordConcernView } from './concernViewApi'

/**
 * Intent: 表示された投稿の既読記録を局所化する。
 * Boundary: 表示中の投稿IDだけを受け取り、値・更新操作を公開しない。
 * State Modeling: 同一マウント内の記録済みIDをrefのSetで保持する。
 * Update Surface: なし。表示と認証条件を満たしたときに記録する。
 * Hidden Complexity: LIFF内・認証済みの条件確認と同一投稿の重複抑止。
 * Composition: フィードと詳細のContainerが表示中のIDを渡す。
 * Test Notes: 通常Web、未認証、認証後、同一投稿と投稿切り替えを確認する。
 */
export function useConcernViewOnDisplay(concernId: string | undefined): void {
  const { state } = useRuntime()
  const { status: authStatus } = useAuth()
  const recordedConcernIds = useRef(new Set<string>())

  useEffect(() => {
    if (
      !concernId ||
      state.status !== 'ready' ||
      state.mode !== 'liff' ||
      authStatus !== 'authenticated' ||
      recordedConcernIds.current.has(concernId)
    ) {
      return
    }

    recordedConcernIds.current.add(concernId)
    void recordConcernView(concernId)
  }, [authStatus, concernId, state])
}
