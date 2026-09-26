import { useTranslation } from '../../i18n/useTranslation'
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
import { TranslationNotice } from '../../shared/components/TranslationNotice'

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
  const { t, message, language } = useTranslation()

  const attributes = [
    ageGroupLabel(concern.attributes.ageGroup, language),
    genderLabel(concern.attributes.gender, language),
    concern.attributes.regionName ?? regionLabel(concern.attributes.regionCode, language),
    createdLabel(concern.createdAt, language),
  ].filter(Boolean)

  return (
    <div className={screen.page}>
      <Link className={actionStyles.text} to="/">
        {t('common.backToFeedArrow')}
      </Link>
      <article className={`${screen.paper} ${screen.taped} ${crayonStyles.edge}`}>
        <p className={screen.meta}>{attributes.join(' · ')}</p>
        <h1 className={screen.body} lang={concern.language === 'en' ? 'en' : 'ja'}>
          {concern.body}
        </h1>
        <TranslationNotice
          actualLanguage={concern.language}
          status={language === 'original' ? undefined : concern.representations[language]}
        />
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
              {reaction.reacted ? t('reaction.supported') : t('reaction.support')} ·{' '}
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
        {reaction.reacted ? t('reaction.announcement', { count: reaction.reactionCount }) : ''}
      </p>
      {showLogin ? <LoginGuide /> : null}
      <Link className={`${actionStyles.primary} ${screen.fullButton}`} to="/">
        {t('detail.next')}
      </Link>
    </div>
  )
}
