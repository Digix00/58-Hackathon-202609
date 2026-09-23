import styles from './ComingSoonLabel.module.css'

export function ComingSoonLabel({
  ariaLabel = '準備中',
  id,
  className,
}: {
  ariaLabel?: string
  id?: string
  className?: string
}) {
  return (
    <span
      id={id}
      className={`${styles.label}${className ? ` ${className}` : ''}`}
      role="status"
      aria-label={ariaLabel}
    >
      <span aria-hidden="true">準備中</span>
    </span>
  )
}
