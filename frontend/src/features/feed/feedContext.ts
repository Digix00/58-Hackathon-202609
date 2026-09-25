import type { AuthStatus } from '../../auth/auth-context'
import type { RuntimeState } from '../../app/providers/RuntimeContext'
import type { FeedSort } from './feedTypes'

export interface FeedContext {
  isLiff: boolean
  enabled: boolean
  sort: FeedSort
}

export function resolveFeedContext(runtime: RuntimeState, authStatus: AuthStatus): FeedContext {
  const runtimeReady = runtime.status === 'ready'
  const isLiff = runtimeReady && runtime.mode === 'liff'

  return {
    isLiff,
    enabled: runtimeReady && (!isLiff || authStatus !== 'initializing'),
    sort: isLiff && authStatus === 'authenticated' ? 'recommended' : 'newest',
  }
}
