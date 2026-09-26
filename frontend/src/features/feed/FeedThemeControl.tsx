import type { RefObject } from 'react'
import { useTranslation } from '../../i18n/useTranslation'
import actionStyles from '../../shared/styles/Actions.module.css'
import type { FeedTheme } from './clusterApi'
import styles from './FeedThemes.module.css'

export function FeedThemeControl({
  theme,
  buttonRef,
  onOpen,
  onClear,
}: {
  theme: FeedTheme | null
  buttonRef: RefObject<HTMLButtonElement | null>
  onOpen: () => void
  onClear: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className={styles.control}>
      <button ref={buttonRef} type="button" className={actionStyles.text} onClick={onOpen}>
        {theme ? t('feed.themeChange', { theme: theme.label }) : t('feed.themes.title')}
      </button>
      {theme ? (
        <button type="button" className={actionStyles.text} onClick={onClear}>
          {t('feed.themeClear')}
        </button>
      ) : null}
    </div>
  )
}
