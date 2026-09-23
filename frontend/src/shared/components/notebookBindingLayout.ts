import type { CSSProperties } from 'react'

export const BINDING_WIDTH = 38
export const HOLE_X = 30.5
export const RING_RADIUS_X = 14.5

/** SVG と紙の回転が同じ金具の座標を参照する。 */
export const notebookBindingStyle = {
  '--binding-width': `${BINDING_WIDTH}px`,
  '--binding-offset': `${-BINDING_WIDTH / 2}px`,
  '--turn-axis': `${HOLE_X - RING_RADIUS_X - BINDING_WIDTH / 2}px`,
} as CSSProperties
