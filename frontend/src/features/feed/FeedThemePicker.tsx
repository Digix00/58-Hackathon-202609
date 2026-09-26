import { useEffect, useRef } from 'react'
import { ErrorState, LoadingState } from '../../shared/components/AsyncStates'
import { useTranslation } from '../../i18n/useTranslation'
import actionStyles from '../../shared/styles/Actions.module.css'
import screen from '../../shared/styles/Screen.module.css'
import type { FeedTheme } from './clusterApi'
import type { FeedFilter } from './feedViewModel'
import { activeFeedFilterLabel } from './feedViewModel'
import { useFeedThemes } from './useFeedThemes'
import styles from './FeedThemes.module.css'

export function FeedThemePicker({
  filter,
  selectedId,
  onSelect,
  onClose,
}: {
  filter: FeedFilter
  selectedId?: string
  onSelect: (theme: FeedTheme | null) => void
  onClose: () => void
}) {
  const themes = useFeedThemes(filter)
  const { t, message, language } = useTranslation()
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    heading.current?.focus()
  }, [themes.cursors.length])
  const condition = activeFeedFilterLabel(filter, language)
  return (
    <section className={`${screen.page} ${styles.picker}`} aria-labelledby="themes-title">
      <button className={actionStyles.text} type="button" onClick={onClose}>
        {t('feed.themes.back')}
      </button>
      <header className={screen.heading}>
        <p className={screen.eyebrow}>{t('feed.themes.eyebrow')}</p>
        <h1 id="themes-title" ref={heading} tabIndex={-1}>
          {t('feed.themes.title')}
        </h1>
        <p className={screen.muted}>{t('feed.themes.description')}</p>
        {condition ? (
          <p className={screen.meta}>{t('feed.themes.condition', { condition })}</p>
        ) : null}
      </header>
      <button type="button" className={actionStyles.secondary} onClick={() => onSelect(null)}>
        {t('feed.themes.readAll')}
      </button>
      {themes.status === 'loading' ? <LoadingState label={t('feed.themes.loading')} /> : null}
      {themes.status === 'error' ? (
        <ErrorState
          description={message(themes.error ?? 'error.loadThemes')}
          onRetry={() => themes.dispatch({ type: 'retry' })}
        />
      ) : null}
      {themes.status === 'success' ? (
        <>
          {themes.items.length === 0 ? (
            <p role="status" className={screen.muted}>
              {t('feed.themes.empty')}
            </p>
          ) : null}
          <ul className={styles.list} aria-label={t('feed.themes.listLabel')}>
            {themes.items.map((theme) => (
              <li key={theme.id}>
                <button
                  type="button"
                  className={styles.choice}
                  aria-pressed={selectedId === theme.id}
                  onClick={() => onSelect(theme)}
                >
                  <span className={styles.label}>{theme.label}</span>
                  <span className={styles.summary}>{theme.summary}</span>
                  <span className={styles.count}>
                    {t('feed.themes.count', { count: theme.concernCount })}
                    {selectedId === theme.id ? t('feed.themes.selected') : ''} →
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <nav className={styles.paging} aria-label={t('feed.themes.pages')}>
        {themes.cursors.length > 1 ? (
          <button
            className={actionStyles.text}
            type="button"
            disabled={themes.status === 'loading'}
            onClick={() => themes.dispatch({ type: 'previous' })}
          >
            {t('feed.themes.previous')}
          </button>
        ) : null}
        {themes.status === 'success' && themes.nextCursor ? (
          <button
            className={actionStyles.text}
            type="button"
            onClick={() => themes.dispatch({ type: 'next' })}
          >
            {t('feed.themes.more')}
          </button>
        ) : null}
      </nav>
    </section>
  )
}
