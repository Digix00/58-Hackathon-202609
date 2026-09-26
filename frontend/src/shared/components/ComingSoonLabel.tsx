import { useTranslation } from '../../i18n/useTranslation'
import styles from './ComingSoonLabel.module.css'

export function ComingSoonLabel({
  ariaLabel = 'common.comingSoon',
  id,
  className,
}: {
  ariaLabel?: string
  id?: string
  className?: string
}) {
  const { t } = useTranslation()

  return (
    <span
      id={id}
      className={`${styles.label}${className ? ` ${className}` : ''}`}
      role="status"
      aria-label={ariaLabel === 'common.comingSoon' ? t('common.comingSoon') : ariaLabel}
    >
      <span aria-hidden="true">{t('common.comingSoon')}</span>
    </span>
  )
}
