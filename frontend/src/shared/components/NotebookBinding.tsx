import { useId, type CSSProperties } from 'react'
import styles from './NotebookBinding.module.css'

const SLOTS = [0, 1, 2, 3, 4, 5, 6, 7]
const WIDTH = 38
const HOLE_X = 30.5
const RING_RADIUS_X = 14.5
const RING_LEFT = HOLE_X - RING_RADIUS_X * 2
const RING_CENTER = HOLE_X - RING_RADIUS_X

const REAR_PATH = `M ${RING_LEFT} 6 C ${RING_LEFT + 0.5} 2.7 ${RING_CENTER - 7} 1.3 ${RING_CENTER} 1.5 C ${RING_CENTER + 8} 1.4 ${HOLE_X - 0.7} 3.2 ${HOLE_X} 6`
const FRONT_PATH = `M ${HOLE_X} 6 C ${HOLE_X - 0.4} 9.2 ${RING_CENTER + 7.5} 10.7 ${RING_CENTER} 10.5 C ${RING_CENTER - 8} 10.7 ${RING_LEFT + 0.5} 8.9 ${RING_LEFT} 6`
const HOLE_PATH =
  'M -5.2 -0.8 C -5.5 -3.5 -3.5 -5.4 -0.8 -5.5 C 2.2 -5.7 5 -3.8 5.4 -1 C 5.8 1.8 3.8 5.2 0.9 5.4 C -2.1 5.7 -5 3.7 -5.2 0.8 Z'

/** SVG と紙の回転が同じ金具の座標を参照する。 */
export const notebookBindingStyle = {
  '--binding-width': `${WIDTH}px`,
  '--binding-offset': `${-WIDTH / 2}px`,
  '--turn-axis': `${RING_CENTER - WIDTH / 2}px`,
} as CSSProperties

export function NotebookBinding({
  part,
  back = false,
  between = false,
}: {
  part: 'rear' | 'front' | 'holes'
  back?: boolean
  between?: boolean
}) {
  const clipId = useId()
  const layer =
    part === 'rear'
      ? between
        ? styles.between
        : styles.rear
      : part === 'front'
        ? styles.front
        : ''

  return (
    <span className={`${styles.binding} ${layer} ${back ? styles.back : ''}`} aria-hidden="true">
      {SLOTS.map((slot) => (
        <svg key={slot} className={styles.mark} viewBox={`0 0 ${WIDTH} 12`}>
          {between ? (
            <defs>
              <clipPath id={`${clipId}-${slot}`}>
                <rect x="0" y="0" width={WIDTH / 2} height="12" />
                <path d={HOLE_PATH} transform={`translate(${HOLE_X} 6)`} />
              </clipPath>
            </defs>
          ) : null}
          {part === 'holes' ? (
            <g transform={`translate(${back ? WIDTH - HOLE_X : HOLE_X} 6)`}>
              <path className={styles.holeFill} d={HOLE_PATH} />
              <path className={styles.holeEdge} d={HOLE_PATH} />
            </g>
          ) : (
            <path
              className={`${styles.ring} ${part === 'rear' ? styles.rearLine : styles.frontLine}`}
              d={part === 'rear' ? REAR_PATH : FRONT_PATH}
              clipPath={between ? `url(#${clipId}-${slot})` : undefined}
            />
          )}
        </svg>
      ))}
    </span>
  )
}
