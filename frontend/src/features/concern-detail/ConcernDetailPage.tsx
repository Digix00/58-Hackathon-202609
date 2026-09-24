import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useAuth } from '../../auth/useAuth'
import { LoginGuide } from '../../app/router'
import { useRuntime } from '../../app/providers/RuntimeContext'
import { ErrorState, LoadingState } from '../../shared/components/AsyncStates'
import actionStyles from '../../shared/styles/Actions.module.css'
import crayonStyles from '../../shared/styles/Crayon.module.css'
import screen from '../../shared/styles/Screen.module.css'
import { labelAgeGroup, labelRegion } from '../feed/feedViewModel'
import { useConcernReaction } from '../reaction/useConcernReaction'
import { useConcernDetail } from './useConcernDetail'

export function ConcernDetailPage() {
  const { id } = useParams()
  const { state: runtime } = useRuntime()
  const { status: authStatus } = useAuth()
  const isLiff = runtime.status === 'ready' && runtime.mode === 'liff'
  const detail = useConcernDetail(id, isLiff && authStatus === 'authenticated')
  const [showLogin, setShowLogin] = useState(false)
  const concern = detail.concern
  const reaction = useConcernReaction({
    concernId: concern?.id ?? '',
    initialReactionCount: concern?.reactionCount ?? 0,
    initialReacted: concern?.reacted ?? false,
  })

  if (detail.status === 'loading' || detail.status === 'idle') {
    return <LoadingState label="声を読み込んでいます…" />
  }

  if (detail.status === 'error' || !concern) {
    return (
      <div className={screen.page}>
        <ErrorState
          title="この声は現在読めません"
          description={detail.error ?? '公開されていないか、見つかりませんでした。'}
          onRetry={() => void detail.retry()}
        />
        <Link className={actionStyles.text} to="/">
          フィードに戻る
        </Link>
      </div>
    )
  }

  const attributes = [
    concern.attributes.ageGroup ? labelAgeGroup(concern.attributes.ageGroup) : null,
    concern.attributes.regionCode ? labelRegion(concern.attributes.regionCode) : null,
  ].filter(Boolean)

  return (
    <div className={screen.page}>
      <Link className={actionStyles.text} to="/">
        ← フィードに戻る
      </Link>
      <article className={`${screen.paper} ${screen.taped} ${crayonStyles.edge}`}>
        <p className={screen.meta}>
          {[...attributes, formatCreatedLabel(concern.createdAt)].join(' · ')}
        </p>
        <h1 className={screen.body}>{concern.body}</h1>
        {isLiff ? (
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
          >
            {reaction.status === 'submitting'
              ? '寄りそっています…'
              : reaction.reacted
                ? 'そっと寄りそいました'
                : 'そっと寄りそう'}{' '}
            · {reaction.reactionCount}件
          </button>
        ) : null}
      </article>
      {reaction.error ? (
        <p aria-live="polite" className={screen.error}>
          {reaction.error}
        </p>
      ) : reaction.reacted ? (
        <p aria-live="polite" className={screen.muted}>
          そっと寄りそいました。現在{reaction.reactionCount}件
        </p>
      ) : null}
      {showLogin ? <LoginGuide /> : null}
      <Link className={`${actionStyles.primary} ${screen.fullButton}`} to="/">
        次の声を読む
      </Link>
    </div>
  )
}

function formatCreatedLabel(createdAt: string): string {
  const timestamp = Date.parse(createdAt)
  if (Number.isNaN(timestamp)) return '日時不明'
  const elapsedDays = Math.max(0, Math.floor((Date.now() - timestamp) / 86_400_000))
  if (elapsedDays === 0) return '今日'
  if (elapsedDays === 1) return '昨日'
  if (elapsedDays < 7) return `${elapsedDays}日前`
  if (elapsedDays < 31) return '今月'
  return 'しばらく前'
}
