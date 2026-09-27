import type { RefObject } from 'react'
import { useTranslation } from '../../i18n/useTranslation'
import actionStyles from '../../shared/styles/Actions.module.css'
import type { FeedTheme } from './clusterApi'
import styles from './FeedThemes.module.css'

/**
 * 紙の上端に挟んだしおり。
 *
 * もくじを開く操作と、いま読んでいるテーマの表示を一枚の付箋にまとめる。
 * 紙の右上には年代・地域の付箋が出るので、ここに置けるのは短い一言だけ。
 * 長いテーマ名は末尾を省き、全文は読み上げ・投稿の紙・もくじの側で渡す。
 */
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
      <button
        ref={buttonRef}
        type="button"
        className={`${styles.mark} ${theme ? styles.marked : ''}`}
        onClick={onOpen}
        aria-label={theme ? t('feed.themeChange', { theme: theme.label }) : undefined}
      >
        <span className={styles.markName}>{theme ? theme.label : t('feed.themes.title')}</span>
      </button>
      {theme ? (
        /* 紙の上は狭いので、解除は短い言葉で置き、読み上げにだけ全文を渡す。 */
        <button
          type="button"
          className={`${actionStyles.text} ${styles.clear}`}
          onClick={onClear}
          aria-label={t('feed.themeClear')}
        >
          {t('feed.themeClearShort')}
        </button>
      ) : null}
    </div>
  )
}
