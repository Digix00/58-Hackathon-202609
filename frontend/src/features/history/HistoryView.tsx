import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useTranslation } from '../../i18n/useTranslation'
import { ErrorState, LoadingState } from '../../shared/components/AsyncStates'
import actionStyles from '../../shared/styles/Actions.module.css'
import crayonStyles from '../../shared/styles/Crayon.module.css'
import screen from '../../shared/styles/Screen.module.css'
import styles from './HistoryPage.module.css'
import { HISTORY_SECTION_LABELS, HISTORY_SECTIONS, type HistorySection } from './historySections'
import type { HistoryStatus } from './useHistory'

function HistoryTabs({
  active,
  onSelect,
}: {
  active: HistorySection
  onSelect: (section: HistorySection) => void
}) {
  const { t } = useTranslation()
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  const moveFocus = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (step === 0) return

    event.preventDefault()
    const next = (index + step + HISTORY_SECTIONS.length) % HISTORY_SECTIONS.length
    onSelect(HISTORY_SECTIONS[next])
    tabRefs.current[next]?.focus()
  }

  return (
    <div className={styles.tabs} role="tablist" aria-label={t('history.tabsLabel')}>
      {HISTORY_SECTIONS.map((section, index) => (
        <button
          key={section}
          ref={(element) => {
            tabRefs.current[index] = element
          }}
          type="button"
          role="tab"
          id={`history-tab-${section}`}
          className={styles.tab}
          aria-selected={section === active}
          aria-controls={`history-panel-${section}`}
          tabIndex={section === active ? 0 : -1}
          onClick={() => onSelect(section)}
          onKeyDown={(event) => moveFocus(event, index)}
        >
          {t(HISTORY_SECTION_LABELS[section])}
        </button>
      ))}
    </div>
  )
}

function HistoryUnavailableView({ onReturnToLine }: { onReturnToLine: () => void }) {
  const { t } = useTranslation()

  return (
    <section className={`${screen.paper} ${crayonStyles.edge}`}>
      <h2>{t('history.unavailable')}</h2>
      <p className={screen.muted}>{t('history.accountUnavailable')}</p>
      <button type="button" className={actionStyles.primary} onClick={onReturnToLine}>
        {t('history.returnLine')}
      </button>
    </section>
  )
}

function HistoryEmptyView({ feedPath }: { feedPath: string }) {
  const { t } = useTranslation()

  return (
    <section className={`${screen.paper} ${crayonStyles.edge}`}>
      <h2>{t('history.firstVoice')}</h2>
      <p className={screen.muted}>{t('history.emptyHint')}</p>
      <Link className={actionStyles.primary} to={feedPath}>
        {t('common.readVoices')}
      </Link>
    </section>
  )
}

/**
 * 履歴画面の外枠。見出しの付箋と、選ばれた1面の紙だけを組む。
 * どの面を出すかは呼び出し元が決め、ここでは読み込み・失敗・空の表示を受け持つ。
 */
export function HistoryView({
  status,
  errorMessage,
  section,
  showEmpty,
  feedPath,
  onSelectSection,
  onRetry,
  onReturnToLine,
  children,
}: {
  status: HistoryStatus
  errorMessage: string | null
  section: HistorySection
  showEmpty: boolean
  feedPath: string
  onSelectSection: (section: HistorySection) => void
  onRetry: () => void
  onReturnToLine: () => void
  children: ReactNode
}) {
  const { t } = useTranslation()

  return (
    <div className={screen.page}>
      <header className={screen.heading}>
        <p className={screen.eyebrow}>{t('nav.history')}</p>
        <h1>{t('history.title')}</h1>
        <p className={screen.muted}>{t('history.description')}</p>
      </header>
      {status === 'loading' ? <LoadingState label={t('history.loading')} /> : null}
      {status === 'error' ? (
        <ErrorState description={errorMessage ?? t('error.historyShort')} onRetry={onRetry} />
      ) : null}
      {status === 'unavailable' ? <HistoryUnavailableView onReturnToLine={onReturnToLine} /> : null}
      {status === 'success' && showEmpty ? <HistoryEmptyView feedPath={feedPath} /> : null}
      {status === 'success' && !showEmpty ? (
        <div className={styles.notebook}>
          <HistoryTabs active={section} onSelect={onSelectSection} />
          <section
            className={`${screen.paper} ${crayonStyles.edge} ${styles.sheet}`}
            role="tabpanel"
            id={`history-panel-${section}`}
            aria-labelledby={`history-tab-${section}`}
          >
            {children}
          </section>
        </div>
      ) : null}
    </div>
  )
}
