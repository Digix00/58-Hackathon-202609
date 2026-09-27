import type { CSSProperties, ReactNode } from 'react'
import crayonStyles from '../styles/Crayon.module.css'
import styles from '../styles/NotebookTurn.module.css'
import { NotebookBinding } from './NotebookBinding'

type NotebookTurnProps = {
  children: ReactNode
  variant?: 'page' | 'cover'
  startAngle?: number
  /**
   * 1 なら、いま読んでいる紙を左へ伏せる。
   * -1 なら、伏せてあった紙を拾い上げて手前へ降ろす。
   */
  direction?: 1 | -1
  onFinish: () => void
}

/**
 * めくりの前半（0〜32%）が受け持つ角度と、その区間が使う時間の割合。
 * 引いた角度がこの区間のどこまで進んだぶんかを測り、その時間を飛ばす。
 */
const TURN_FIRST_ANGLE = 46
const TURN_FIRST_SHARE = 0.32

/** 表紙は本文の紙より大きく動かす。開くときも、閉じるときも同じ手つきにする。 */
function coverStyle(direction: 1 | -1) {
  return direction === 1 ? styles.coverTurning : styles.coverTurningBack
}

/** 紙そのものを金具の軸で回す。リングは静止した NotebookBinding が描く。 */
export function NotebookTurn({
  children,
  variant = 'page',
  startAngle = 0,
  direction = 1,
  onFinish,
}: NotebookTurnProps) {
  return (
    <>
      <NotebookBinding part="rear" between />
      <div
        className={`${direction === 1 ? styles.turning : styles.turningBack} ${
          variant === 'cover' ? coverStyle(direction) : ''
        }`}
        style={
          {
            '--turn-start': `${startAngle}deg`,
            '--turn-skip':
              (Math.min(TURN_FIRST_ANGLE, Math.abs(startAngle)) / TURN_FIRST_ANGLE) *
              TURN_FIRST_SHARE,
          } as CSSProperties
        }
        aria-hidden="true"
        inert
        onAnimationEnd={(event) => {
          if (event.target === event.currentTarget) onFinish()
        }}
      >
        <div className={styles.face}>{children}</div>
        <NotebookPageBack />
      </div>
    </>
  )
}

/** めくり中も左に伏せた後も、同じ無地の紙を描く。 */
function NotebookPageBack() {
  return (
    <div className={`${styles.back} ${crayonStyles.edge}`}>
      <NotebookBinding part="holes" back />
    </div>
  )
}

export function NotebookTurnedPage() {
  return (
    <div className={styles.turned} aria-hidden="true">
      <NotebookPageBack />
    </div>
  )
}
