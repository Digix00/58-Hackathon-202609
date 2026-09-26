import { useTranslation } from '../../i18n/useTranslation'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useAuth } from '../../auth/useAuth'
import { useRuntime } from '../../app/providers/RuntimeContext'
import { ErrorState, EmptyState, LoadingState } from '../../shared/components/AsyncStates'
import actionStyles from '../../shared/styles/Actions.module.css'
import screen from '../../shared/styles/Screen.module.css'
import { useConcernReaction } from '../reaction/useConcernReaction'
import { ConcernDetailView } from './ConcernDetailView'
import { useConcernDetail } from './useConcernDetail'
import { toConcernDetailViewModel } from './concernDetailViewModel'

export function ConcernDetailPage() {
  const { t, language } = useTranslation()

  const { id } = useParams()
  const { state: runtime } = useRuntime()
  const { status: authStatus, user } = useAuth()
  const { status, concern, error, retry } = useConcernDetail(id, { authUserId: user?.id })
  const [showLogin, setShowLogin] = useState(false)
  const reaction = useConcernReaction({
    concernId: concern?.id ?? '',
    initialReactionCount: concern?.reactionCount ?? 0,
    initialReacted: concern?.reacted ?? false,
  })
  if (status === 'idle' || status === 'loading') {
    return <LoadingState label={t('feed.loading')} />
  }

  if (status === 'error') {
    return <ErrorState description={error ?? t('error.loadConcernShort')} onRetry={retry} />
  }

  if (!concern) {
    return (
      <div className={screen.page}>
        <EmptyState title={t('detail.unavailable')} description={t('detail.notFound')} />
        <Link className={actionStyles.text} to="/">
          {t('common.backToFeed')}
        </Link>
      </div>
    )
  }

  return (
    <ConcernDetailView
      concern={toConcernDetailViewModel(concern, language)}
      isLiff={runtime.status === 'ready' && runtime.mode === 'liff'}
      showLogin={showLogin}
      reaction={{
        reactionCount: reaction.reactionCount,
        reacted: reaction.reacted,
        submitting: reaction.status === 'submitting',
        error: reaction.error,
      }}
      onReact={() => {
        if (authStatus !== 'authenticated') {
          setShowLogin(true)
          return
        }
        void reaction.react()
      }}
    />
  )
}
