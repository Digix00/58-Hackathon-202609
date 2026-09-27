import { useTranslation } from '../../i18n/useTranslation'
import { Link } from 'react-router'
import { LoginGuide } from '../../app/router'
import type { ConcernReactionStatus } from '../reaction/useConcernReaction'
import type { ConcernDetailViewModel } from './concernDetailViewModel'
import actionStyles from '../../shared/styles/Actions.module.css'
import crayonStyles from '../../shared/styles/Crayon.module.css'
import screen from '../../shared/styles/Screen.module.css'
import { TranslationNotice } from '../../shared/components/TranslationNotice'

type ConcernDetailViewProps = {
  concern: ConcernDetailViewModel
  isLiff: boolean
  showLogin: boolean
  reaction: {
    reactionCount: number
    reacted: boolean
    submitting: boolean
    status: ConcernReactionStatus
    error: string | null
  }
  onReact: () => void
}

export function ConcernDetailView({
  concern,
  isLiff,
  showLogin,
  reaction,
  onReact,
}: ConcernDetailViewProps) {
  const { t, message } = useTranslation()

  return (
    <div className={screen.page}>
      <Link className={actionStyles.text} to="/">
        {t('common.backToFeedArrow')}
      </Link>
      <article className={`${screen.paper} ${screen.taped} ${crayonStyles.edge}`}>
        <p className={screen.meta}>{concern.attributesLabel}</p>
        <h1 className={screen.body} lang={concern.bodyLanguage}>
          {concern.body}
        </h1>
        <TranslationNotice actualLanguage={concern.language} status={concern.translationStatus} />
        {isLiff ? (
          <>
            <button
              type="button"
              className={actionStyles.secondary}
              onClick={onReact}
              disabled={reaction.submitting}
              aria-pressed={reaction.reacted}
              aria-busy={reaction.submitting}
            >
              {reaction.reacted ? t('reaction.remove') : t('reaction.support')} ·{' '}
              {t('common.count', { count: reaction.reactionCount })}
            </button>
            {reaction.error ? (
              <p role="alert" className={screen.muted}>
                {message(reaction.error)}
              </p>
            ) : null}
          </>
        ) : null}
      </article>
      <p aria-live="polite" className={screen.muted}>
        {reaction.reacted
          ? t('reaction.announcement', { count: reaction.reactionCount })
          : reaction.status === 'succeeded'
            ? t('reaction.removedAnnouncement', { count: reaction.reactionCount })
            : ''}
      </p>
      {showLogin ? <LoginGuide /> : null}
      <Link className={`${actionStyles.primary} ${screen.fullButton}`} to="/">
        {t('detail.next')}
      </Link>
    </div>
  )
}
