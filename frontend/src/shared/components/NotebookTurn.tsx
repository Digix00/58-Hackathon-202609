import type { CSSProperties, ReactNode } from 'react'
import crayonStyles from '../styles/Crayon.module.css'
import styles from '../styles/NotebookTurn.module.css'
import { NotebookBinding } from './NotebookBinding'

type NotebookTurnProps = {
  children: ReactNode
  backColor: string
  variant?: 'page' | 'cover'
  startAngle?: number
  /**
   * 1 なら、いま読んでいる紙を左へ伏せる。
   * -1 なら、伏せてあった紙を拾い上げて手前へ降ろす。
   */
  direction?: 1 | -1
  onFinish: () => void
}

/** 表紙は本文の紙より大きく動かす。開くときも、閉じるときも同じ手つきにする。 */
function coverStyle(direction: 1 | -1) {
  return direction === 1 ? styles.coverTurning : styles.coverTurningBack
}

/** 紙そのものを金具の軸で回す。リングは静止した NotebookBinding が描く。 */
export function NotebookTurn({
  children,
  backColor,
  variant = 'page',
  startAngle = 0,
  direction = 1,
  onFinish,
}: NotebookTurnProps) {
  return (
    <div
      className={`${direction === 1 ? styles.turning : styles.turningBack} ${
        variant === 'cover' ? coverStyle(direction) : ''
      }`}
      style={
        {
          '--turn-start': `${startAngle}deg`,
          '--turn-back-color': backColor,
        } as CSSProperties
      }
      aria-hidden="true"
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget) onFinish()
      }}
    >
      <div className={styles.face}>{children}</div>
      <div className={`${styles.back} ${crayonStyles.edge}`}>
        <NotebookBinding part="holes" back />
      </div>
    </div>
  )
}
