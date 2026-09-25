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

export function ConcernDetailPage() {
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
    return <LoadingState label="声を読み込んでいます…" />
  }

  if (status === 'error') {
    return <ErrorState description={error ?? '投稿を読み込めませんでした。'} onRetry={retry} />
  }

  if (!concern) {
    return (
      <div className={screen.page}>
        <EmptyState
          title="この声は現在読めません"
          description="公開されていないか、見つかりませんでした。"
        />
        <Link className={actionStyles.text} to="/">
          フィードに戻る
        </Link>
      </div>
    )
  }

  return (
    <ConcernDetailView
      concern={concern}
      isLiff={runtime.status === 'ready' && runtime.mode === 'liff'}
      isAuthenticated={authStatus === 'authenticated'}
      showLogin={showLogin}
      reaction={reaction}
      onShowLogin={() => setShowLogin(true)}
    />
  )
}
