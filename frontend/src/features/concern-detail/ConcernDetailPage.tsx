import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useAuth } from '../../auth/useAuth'
import { LoginGuide } from '../../app/router'
import { useRuntime } from '../../app/providers/RuntimeContext'
import { ErrorState, EmptyState, LoadingState } from '../../shared/components/AsyncStates'
import {
  ageGroupLabel,
  createdLabel,
  genderLabel,
  regionLabel,
} from '../../shared/concernPresentation'
import actionStyles from '../../shared/styles/Actions.module.css'
import crayonStyles from '../../shared/styles/Crayon.module.css'
import screen from '../../shared/styles/Screen.module.css'
import { useConcernReaction } from '../reaction/useConcernReaction'
import { useConcernDetail } from './useConcernDetail'

export function ConcernDetailPage() {
  const { id } = useParams()
  const { state: runtime } = useRuntime()
  const { status: authStatus } = useAuth()
  const { status, concern, error, retry } = useConcernDetail(id)
  const [showLogin, setShowLogin] = useState(false)
  const reaction = useConcernReaction({
    concernId: concern?.id ?? '',
    initialReactionCount: concern?.reactionCount ?? 0,
    initialReacted: concern?.reacted ?? false,
  })
  const isLiff = runtime.status === 'ready' && runtime.mode === 'liff'

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

  const attributes = [
    ageGroupLabel(concern.attributes.ageGroup),
    genderLabel(concern.attributes.gender),
    regionLabel(concern.attributes.regionCode),
    createdLabel(concern.createdAt),
  ].filter(Boolean)

  return (
    <div className={screen.page}>
      <Link className={actionStyles.text} to="/">
        ← フィードに戻る
      </Link>
      <article className={`${screen.paper} ${screen.taped} ${crayonStyles.edge}`}>
        <p className={screen.meta}>{attributes.join(' · ')}</p>
        <h1 className={screen.body}>{concern.body}</h1>
        {isLiff ? (
          <>
            <button
              type="button"
              className={actionStyles.secondary}
              onClick={() => {
                if (authStatus !== 'authenticated') {
                  setShowLogin(true)
                  return
                }
                void reaction.react()
              }}
              disabled={reaction.reacted || reaction.status === 'submitting'}
              aria-pressed={reaction.reacted}
              aria-busy={reaction.status === 'submitting'}
            >
              {reaction.reacted ? 'そっと寄りそいました' : 'そっと寄りそう'} ·{' '}
              {reaction.reactionCount}件
            </button>
            {reaction.error ? (
              <p role="alert" className={screen.muted}>
                {reaction.error}
              </p>
            ) : null}
          </>
        ) : null}
      </article>
      <p aria-live="polite" className={screen.muted}>
        {reaction.reacted ? `そっと寄りそいました。現在${reaction.reactionCount}件` : ''}
      </p>
      {showLogin ? <LoginGuide /> : null}
      <Link className={`${actionStyles.primary} ${screen.fullButton}`} to="/">
        次の声を読む
      </Link>
    </div>
  )
}
