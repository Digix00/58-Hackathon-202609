import type { RefObject } from 'react'
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
  return (
    <div className={styles.control}>
      <button ref={buttonRef} type="button" className={actionStyles.text} onClick={onOpen}>
        {theme ? `テーマ：${theme.label} · 変更` : 'テーマでえらぶ'}
      </button>
      {theme ? (
        <button type="button" className={actionStyles.text} onClick={onClear}>
          テーマを解除
        </button>
      ) : null}
    </div>
  )
}
