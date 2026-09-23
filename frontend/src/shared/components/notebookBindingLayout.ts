import type { CSSProperties } from 'react'

export const BINDING_WIDTH = 38
export const HOLE_X = 30.5
export const RING_RADIUS_X = 14.5

/**
 * SVG と紙の回転が同じ金具の座標を参照する。
 *
 * --turn-axis はリングの中心。とじ穴はそこから RING_RADIUS_X だけ右にあるので、
 * この軸で紙を回すと、穴はリングの上をなぞって反対側へ渡る。
 *
 * 奥行きは束の側に持たせる。紙ごとに perspective() を変形へ混ぜると、
 * 消失点が紙の回転軸の上に乗り、めくりではなく飛んでいく動きになる。
 */
export const notebookBindingStyle = {
  '--binding-width': `${BINDING_WIDTH}px`,
  '--binding-offset': `${-BINDING_WIDTH / 2}px`,
  '--turn-axis': `${HOLE_X - RING_RADIUS_X - BINDING_WIDTH / 2}px`,
  perspective: '1150px',
  perspectiveOrigin: '50% 50%',
} as CSSProperties
