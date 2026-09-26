import { useTranslation } from '../../i18n/useTranslation'
import type { ReactNode } from 'react'
import crayonStyles from '../styles/Crayon.module.css'
import styles from './AsyncStates.module.css'
import { isMessageKey } from '../../i18n/translate'

type ErrorStateProps = { title?: ReactNode; description: string; onRetry?: () => void }

export function LoadingState({ label = 'common.loading' }: { label?: string }) {
  const { message } = useTranslation()
  const displayLabel = label === 'common.loading' ? message(label) : label
  return (
    <section
      className={`${styles.card} ${crayonStyles.edge}`}
      aria-busy="true"
      aria-label={displayLabel}
    >
      <div className={`${styles.skeleton} ${styles.line} ${styles.short}`} />
      <div className={`${styles.skeleton} ${styles.line}`} />
      <div className={`${styles.skeleton} ${styles.line}`} />
      <p>{displayLabel}</p>
    </section>
  )
}

export function ErrorState({ title = 'common.loadFailed', description, onRetry }: ErrorStateProps) {
  const { t, message } = useTranslation()

  return (
    <section className={`${styles.card} ${crayonStyles.edge}`} role="alert">
      <h1>{typeof title === 'string' && isMessageKey(title) ? message(title) : title}</h1>
      <p>{isMessageKey(description) ? message(description) : description}</p>
      {onRetry ? (
        <button className={styles.retryButton} type="button" onClick={onRetry}>
          {t('common.retry')}
        </button>
      ) : null}
    </section>
  )
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <section className={`${styles.card} ${crayonStyles.edge}`}>
      <h1>{title}</h1>
      <p>{description}</p>
    </section>
  )
}
