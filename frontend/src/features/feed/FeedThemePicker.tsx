import { useEffect, useRef, type CSSProperties } from 'react'
import { ErrorState, LoadingState } from '../../shared/components/AsyncStates'
import { NotebookBinding } from '../../shared/components/NotebookBinding'
import { notebookBindingStyle } from '../../shared/components/notebookBindingLayout'
import { useTranslation } from '../../i18n/useTranslation'
import actionStyles from '../../shared/styles/Actions.module.css'
import crayonStyles from '../../shared/styles/Crayon.module.css'
import screen from '../../shared/styles/Screen.module.css'
import type { FeedTheme } from './clusterApi'
import type { FeedFilter } from './feedViewModel'
import { activeFeedFilterLabel } from './feedViewModel'
import { paletteForPage } from './themePalette'
import { useFeedThemes } from './useFeedThemes'
import styles from './FeedThemes.module.css'

/**
 * 声のもくじ。
 *
 * 本を読んでいる途中で開く面なので、カードを並べた一覧にはしない。
 * 声の紙と同じ紙・同じとじ代の一枚に、題と件数を点線でつないだ目次として組む。
 * 「どれを読むか決める」ことだけが役目なので、紙に載せるのはテーマの言葉だけにし、
 * 逃げ道（テーマをしぼらず読む）は紙の外へ置く。
 */
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
    // 見出しは紙の上端にあるので、フォーカスのために画面を巻き戻さない。
    heading.current?.focus({ preventScroll: true })
  }, [themes.cursors.length])
  const condition = activeFeedFilterLabel(filter, language)
  return (
    <section className={`${screen.page} ${styles.picker}`} aria-labelledby="themes-title">
      <button className={`${actionStyles.text} ${styles.back}`} type="button" onClick={onClose}>
        {t('feed.themes.back')}
      </button>
      {/* とじ穴。声の紙と同じ位置に開け、同じ本の一枚として綴じる。 */}
      <div
        className={`${screen.paper} ${crayonStyles.edge} ${styles.sheet}`}
        style={notebookBindingStyle}
      >
        <NotebookBinding part="holes" />
        <header className={`${screen.heading} ${styles.head}`}>
          <p className={screen.eyebrow}>{t('feed.themes.eyebrow')}</p>
          <h1 id="themes-title" ref={heading} tabIndex={-1}>
            {t('feed.themes.title')}
          </h1>
          <p className={`${screen.muted} ${styles.lead}`}>{t('feed.themes.description')}</p>
          {condition ? (
            <p className={`${screen.bookmark} ${styles.condition}`}>
              {t('feed.themes.condition', { condition })}
            </p>
          ) : null}
        </header>
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
              <p role="status" className={`${screen.muted} ${styles.empty}`}>
                {t('feed.themes.empty')}
              </p>
            ) : null}
            <ul className={styles.list} aria-label={t('feed.themes.listLabel')}>
              {themes.items.map((theme, order) => (
                <li key={theme.id}>
                  <button
                    type="button"
                    className={styles.choice}
                    aria-pressed={selectedId === theme.id}
                    onClick={() => onSelect(theme)}
                    // 付箋の色は並び順から取る。テーマから引くと隣り合う行が同じ色になりうる。
                    style={{ '--entry-tab': paletteForPage(order + 1).bookmark } as CSSProperties}
                  >
                    <span className={styles.tab} aria-hidden="true" />
                    <span className={styles.line}>
                      <span className={styles.label}>{theme.label}</span>
                      <span className={styles.leader} aria-hidden="true" />
                      <span className={styles.count}>
                        {t('feed.themes.count', { count: theme.concernCount })}
                        <span className={styles.arrow} aria-hidden="true">
                          →
                        </span>
                      </span>
                    </span>
                    <span className={styles.summary}>{theme.summary}</span>
                    {selectedId === theme.id ? (
                      <span className={styles.reading}>{t('feed.themes.selected')}</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : null}
        <nav className={styles.paging} aria-label={t('feed.themes.pages')}>
          {themes.cursors.length > 1 ? (
            <button
              className={`${actionStyles.text} ${styles.previous}`}
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
      </div>
      <button
        type="button"
        className={`${actionStyles.secondary} ${styles.readAll}`}
        onClick={() => onSelect(null)}
      >
        {t('feed.themes.readAll')}
      </button>
    </section>
  )
}
