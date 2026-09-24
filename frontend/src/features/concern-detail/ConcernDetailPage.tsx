import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useAuth } from '../../auth/useAuth'
import { LoginGuide } from '../../app/router'
import { useRuntime } from '../../app/providers/RuntimeContext'
import { ErrorState, EmptyState, LoadingState } from '../../shared/components/AsyncStates'
import { DemoBoundary } from '../../shared/components/DemoBoundary'
import actionStyles from '../../shared/styles/Actions.module.css'
import crayonStyles from '../../shared/styles/Crayon.module.css'
import screen from '../../shared/styles/Screen.module.css'
import { isBackendDevMode } from '../../lib/devMode'
import { toDemoConcern } from '../demo/demoAdapter'
import { reactToDemoConcern, useDemoState, type DemoConcern } from '../demo/demoStore'
import { useDemoViewed } from '../demo/useDemoViewed'
import { useConcernReaction } from '../reaction/useConcernReaction'
import { useConcernDetail } from './useConcernDetail'

export function ConcernDetailPage() {
  const { id } = useParams()
  const { concerns: demoConcerns } = useDemoState()
  const { state: runtime } = useRuntime()
  const { status: authStatus } = useAuth()
  const [showLogin, setShowLogin] = useState(false)
  const backendMode = isBackendDevMode
  const isLiff = runtime.status === 'ready' && runtime.mode === 'liff'
  const apiDetail = useConcernDetail(id, {
    enabled: backendMode,
    trackView: backendMode && isLiff && authStatus === 'authenticated',
  })
  const demoConcern = demoConcerns.find((item) => item.id === id)
  const baseConcern: DemoConcern | undefined = backendMode
    ? apiDetail.concern
      ? toDemoConcern(apiDetail.concern)
      : undefined
    : demoConcern
  const reaction = useConcernReaction({
    concernId: baseConcern?.id ?? '',
    initialReactionCount: baseConcern?.reactionCount ?? 0,
    initialReacted: baseConcern?.reacted ?? false,
  })
  const concern =
    baseConcern && backendMode
      ? {
          ...baseConcern,
          reactionCount: reaction.reactionCount,
          reacted: reaction.reacted,
        }
      : baseConcern
  const articleRef = useDemoViewed(
    concern?.id,
    !backendMode && isLiff && authStatus === 'authenticated',
  )

  return (
    <DemoBoundary
      emptyTitle="この声は現在読めません"
      emptyDescription="フィードへ戻って別の声をお読みください。"
    >
      {backendMode && (apiDetail.status === 'idle' || apiDetail.status === 'loading') ? (
        <LoadingState label="声を読み込んでいます…" />
      ) : backendMode && apiDetail.status === 'error' ? (
        <div className={screen.page}>
          <ErrorState
            description={apiDetail.error ?? '投稿を読み込めませんでした。'}
            onRetry={() => void apiDetail.retry()}
          />
          <Link className={actionStyles.text} to="/">
            フィードに戻る
          </Link>
        </div>
      ) : !concern ? (
        <div className={screen.page}>
          <EmptyState
            title="この声は現在読めません"
            description="公開されていないか、見つかりませんでした。"
          />
          <Link className={actionStyles.text} to="/">
            フィードに戻る
          </Link>
        </div>
      ) : (
        <div className={screen.page}>
          <Link className={actionStyles.text} to="/">
            ← フィードに戻る
          </Link>
          <article
            ref={articleRef}
            className={`${screen.paper} ${screen.taped} ${crayonStyles.edge}`}
          >
            <p className={screen.meta}>
              {[concern.ageGroup, concern.region, concern.createdLabel].filter(Boolean).join(' · ')}
            </p>
            <h1 className={screen.body}>{concern.body}</h1>
            {isLiff ? (
              <button
                type="button"
                className={actionStyles.secondary}
                onClick={() => {
                  if (authStatus !== 'authenticated') setShowLogin(true)
                  else if (backendMode) void reaction.react()
                  else reactToDemoConcern(concern.id)
                }}
                disabled={concern.reacted || reaction.status === 'submitting'}
                aria-pressed={concern.reacted}
              >
                {concern.reacted ? 'そっと寄りそいました' : 'そっと寄りそう'} ·{' '}
                {concern.reactionCount}件
              </button>
            ) : null}
            {backendMode && reaction.error ? (
              <p className={screen.muted} role="alert">
                {reaction.error}
              </p>
            ) : null}
          </article>
          <p aria-live="polite" className={screen.muted}>
            {concern.reacted ? `そっと寄りそいました。現在${concern.reactionCount}件` : ''}
          </p>
          {showLogin ? <LoginGuide /> : null}
          <Link className={`${actionStyles.primary} ${screen.fullButton}`} to="/">
            次の声を読む
          </Link>
        </div>
      )}
    </DemoBoundary>
  )
}
