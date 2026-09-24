import { Link } from 'react-router'
import { LoginGuide } from '../../app/router'
import type { UseConcernReactionResult } from '../reaction/useConcernReaction'
import type { ConcernDetail } from './concernDetailTypes'
import {
  ageGroupLabel,
  createdLabel,
  genderLabel,
  regionLabel,
} from '../../shared/concernPresentation'
import actionStyles from '../../shared/styles/Actions.module.css'
import crayonStyles from '../../shared/styles/Crayon.module.css'
import screen from '../../shared/styles/Screen.module.css'

type ConcernDetailViewProps = {
  concern: ConcernDetail
  isLiff: boolean
  isAuthenticated: boolean
  showLogin: boolean
  reaction: UseConcernReactionResult
  onShowLogin: () => void
}

export function ConcernDetailView({
  concern,
  isLiff,
  isAuthenticated,
  showLogin,
  reaction,
  onShowLogin,
}: ConcernDetailViewProps) {
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
                if (!isAuthenticated) {
                  onShowLogin()
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
