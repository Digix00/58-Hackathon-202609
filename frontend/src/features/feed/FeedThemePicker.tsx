import { useEffect, useRef } from 'react'
import { ErrorState, LoadingState } from '../../shared/components/AsyncStates'
import actionStyles from '../../shared/styles/Actions.module.css'
import screen from '../../shared/styles/Screen.module.css'
import type { FeedTheme } from './clusterApi'
import type { FeedFilter } from './feedViewModel'
import { activeFeedFilterLabel } from './feedViewModel'
import { useFeedThemes } from './useFeedThemes'
import styles from './FeedThemes.module.css'

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
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    heading.current?.focus()
  }, [themes.cursors.length])
  const condition = activeFeedFilterLabel(filter)
  return (
    <section className={`${screen.page} ${styles.picker}`} aria-labelledby="themes-title">
      <button className={actionStyles.text} type="button" onClick={onClose}>
        ← 読んでいた声に戻る
      </button>
      <header className={screen.heading}>
        <p className={screen.eyebrow}>声のもくじ</p>
        <h1 id="themes-title" ref={heading} tabIndex={-1}>
          テーマでえらぶ
        </h1>
        <p className={screen.muted}>気になるテーマから、誰かの声を読んでみませんか。</p>
        {condition ? <p className={screen.meta}>条件：{condition}</p> : null}
      </header>
      <button type="button" className={actionStyles.secondary} onClick={() => onSelect(null)}>
        テーマをしぼらず読む
      </button>
      {themes.status === 'loading' ? <LoadingState label="テーマを読み込んでいます…" /> : null}
      {themes.status === 'error' ? (
        <ErrorState
          description={themes.error ?? 'テーマを読み込めませんでした。'}
          onRetry={() => themes.dispatch({ type: 'retry' })}
        />
      ) : null}
      {themes.status === 'success' ? (
        <>
          {themes.items.length === 0 ? (
            <p role="status" className={screen.muted}>
              この条件のテーマは、まだありません。テーマをしぼらずに声を読めます。
            </p>
          ) : null}
          <ul className={styles.list} aria-label="読むテーマ">
            {themes.items.map((theme) => (
              <li key={theme.id}>
                <button
                  type="button"
                  className={styles.choice}
                  aria-pressed={selectedId === theme.id}
                  onClick={() => onSelect(theme)}
                >
                  <span className={styles.label}>{theme.label}</span>
                  <span className={styles.summary}>{theme.summary}</span>
                  <span className={styles.count}>
                    {theme.concernCount}件の声{selectedId === theme.id ? ' · 選択中' : ''} →
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <nav className={styles.paging} aria-label="テーマのページ">
        {themes.cursors.length > 1 ? (
          <button
            className={actionStyles.text}
            type="button"
            disabled={themes.status === 'loading'}
            onClick={() => themes.dispatch({ type: 'previous' })}
          >
            ← 前のテーマ
          </button>
        ) : null}
        {themes.status === 'success' && themes.nextCursor ? (
          <button
            className={actionStyles.text}
            type="button"
            onClick={() => themes.dispatch({ type: 'next' })}
          >
            ほかのテーマ →
          </button>
        ) : null}
      </nav>
    </section>
  )
}
