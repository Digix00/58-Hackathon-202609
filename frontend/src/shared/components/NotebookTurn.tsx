import type { CSSProperties, ReactNode } from 'react'
import crayonStyles from '../styles/Crayon.module.css'
import styles from '../styles/NotebookTurn.module.css'
import { NotebookBinding } from './NotebookBinding'

type NotebookTurnProps = {
  children: ReactNode
  backColor: string
  startAngle?: number
  onFinish: () => void
}

/** 紙そのものを一回転させる。リングは静止した NotebookBinding が描く。 */
export function NotebookTurn({ children, backColor, startAngle = 0, onFinish }: NotebookTurnProps) {
  return (
    <div
      className={styles.turning}
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
