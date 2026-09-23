import crayonStyles from '../styles/Crayon.module.css'
import styles from './AsyncStates.module.css'

type ErrorStateProps = { title?: string; description: string; onRetry?: () => void }

export function LoadingState({ label = '読み込んでいます…' }: { label?: string }) {
  return (
    <section className={`${styles.card} ${crayonStyles.edge}`} aria-busy="true" aria-label={label}>
      <div className={`${styles.skeleton} ${styles.line} ${styles.short}`} />
      <div className={`${styles.skeleton} ${styles.line}`} />
      <div className={`${styles.skeleton} ${styles.line}`} />
      <p>{label}</p>
    </section>
  )
}

export function ErrorState({
  title = '読み込めませんでした',
  description,
  onRetry,
}: ErrorStateProps) {
  return (
    <section className={`${styles.card} ${crayonStyles.edge}`} role="alert">
      <h1>{title}</h1>
      <p>{description}</p>
      {onRetry ? (
        <button className={styles.retryButton} type="button" onClick={onRetry}>
          もう一度試す
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
