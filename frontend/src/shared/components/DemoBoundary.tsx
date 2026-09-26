import { useTranslation } from '../../i18n/useTranslation'
import type { ReactNode } from 'react'
import { EmptyState, ErrorState, LoadingState } from './AsyncStates'
import { ComingSoonLabel } from './ComingSoonLabel'
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
  const { t } = useTranslation()

  if (!import.meta.env.DEV) {
    return (
      <ErrorState
        title={<ComingSoonLabel ariaLabel={t('demo.unavailable')} />}
        description={t('demo.wait')}
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
        description={t('demo.failed')}
        onRetry={() => window.location.assign(window.location.pathname)}
      />
    )
  }
  return children
}
