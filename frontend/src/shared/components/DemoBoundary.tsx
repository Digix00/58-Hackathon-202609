import type { ReactNode } from 'react'
import { EmptyState, ErrorState, LoadingState } from './AsyncStates'
import { getDemoScenario } from '../../features/demo/demoStore'

export function DemoBoundary({
  children,
  emptyTitle,
  emptyDescription,
}: {
  children: ReactNode
  emptyTitle: string
  emptyDescription: string
}) {
  if (!import.meta.env.DEV) {
    return (
      <ErrorState
        title="この画面は準備中です"
        description="データの接続が完了していません。しばらくお待ちください。"
      />
    )
  }

  const scenario = getDemoScenario()
  if (scenario === 'loading') return <LoadingState />
  if (scenario === 'empty') {
    return <EmptyState title={emptyTitle} description={emptyDescription} />
  }
  if (scenario === 'error') {
    return (
      <ErrorState
        description="開発用データを読み込めませんでした。"
        onRetry={() => window.location.assign(window.location.pathname)}
      />
    )
  }
  return children
}
