type ErrorStateProps = { title?: string; description: string; onRetry?: () => void }

export function LoadingState({ label = '読み込んでいます…' }: { label?: string }) {
  return (
    <section className="state-card" aria-busy="true" aria-label={label}>
      <div className="skeleton skeleton-line skeleton-short" />
      <div className="skeleton skeleton-line" />
      <div className="skeleton skeleton-line" />
      <p>{label}</p>
    </section>
  )
}

export function ErrorState({ title = '読み込めませんでした', description, onRetry }: ErrorStateProps) {
  return (
    <section className="state-card" role="alert">
      <h1>{title}</h1>
      <p>{description}</p>
      {onRetry ? <button className="text-button" type="button" onClick={onRetry}>もう一度試す</button> : null}
    </section>
  )
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return <section className="state-card"><h1>{title}</h1><p>{description}</p></section>
}
