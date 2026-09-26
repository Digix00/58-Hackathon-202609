import type { ReactNode, Ref } from 'react'
import { NotebookBinding } from './NotebookBinding'
import { notebookBindingStyle } from './notebookBindingLayout'
import { NotebookTurnedPage } from './NotebookTurn'
import styles from './NotebookStack.module.css'

type NotebookStackProps = {
  children: ReactNode
  className?: string
  ref?: Ref<HTMLDivElement>
  opened: boolean
  turning?: ReactNode
  /** 紙束の下に敷く表紙の装飾。 */
  decoration?: ReactNode
  /** 紙の下から上辺へ出すしおりなど。 */
  bookmarks?: ReactNode
}

/** 表紙を開くときの拡大と、useStackLift による押し上げを描画する。 */
export function NotebookOpening({
  children,
  opening,
  ref,
}: {
  children: ReactNode
  opening: boolean
  ref?: Ref<HTMLDivElement>
}) {
  return (
    <div ref={ref} className={`${styles.motion} ${opening ? styles.opening : ''}`}>
      {children}
    </div>
  )
}

/** 紙束・リング・左の紙・めくりの重なりと回転軸を全画面で共有する。 */
export function NotebookStack({
  children,
  className = '',
  ref,
  opened,
  turning,
  decoration,
  bookmarks,
}: NotebookStackProps) {
  return (
    <div ref={ref} className={`${styles.stack} ${className}`} style={notebookBindingStyle}>
      {decoration}
      <span className={`${styles.sheet} ${styles.sheetFar}`} aria-hidden="true" />
      <span className={`${styles.sheet} ${styles.sheetNear}`} aria-hidden="true" />
      <NotebookBinding part="rear" />
      {bookmarks}
      {opened ? <NotebookTurnedPage /> : null}
      {turning}
      {children}
      <NotebookBinding part="front" />
    </div>
  )
}
