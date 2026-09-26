import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import styles from './QuizPage.module.css'

const DROP_PAD = 22
const TAP_SLOP = 8

export type DragState = {
  personId: string
  x: number
  y: number
  over: boolean
  width: number
  height: number
}
/**
 * Intent: しおり選択のタップ・マウスドラッグ判定を局所化する。
 * Boundary: 配置コールバックを受け取り、ドラッグ表示とドロップ先ref・開始操作を返す。
 * State Modeling: ドラッグしていない状態はnull、操作中は必要な座標をまとめてuseStateで保持する。
 * Update Surface: startDrag。
 * Hidden Complexity: pointerIdの対応、移動閾値、タッチのスクロール・キャンセルを扱う。
 * Composition: QuizTrayから受けた入力をuseQuizNavigationの配置操作へ通知する。
 * Test Notes: タップ、マウスドラッグ、タッチ移動、中断を確認する。
 */
export function useQuizDrag(fit: (personId: string) => void) {
  const [drag, setDrag] = useState<DragState | null>(null)
  const slotRef = useRef<HTMLSpanElement | null>(null)

  function isOverSlot(x: number, y: number) {
    const rect = slotRef.current?.getBoundingClientRect()
    if (!rect) return false
    return (
      x >= rect.left - DROP_PAD &&
      x <= rect.right + DROP_PAD &&
      y >= rect.top - DROP_PAD &&
      y <= rect.bottom + DROP_PAD
    )
  }

  function startDrag(event: ReactPointerEvent<HTMLButtonElement>, personId: string) {
    if (event.button !== 0 || !event.isPrimary) return
    // タッチでは下方向ドラッグを使わず、タップだけで選ぶ。
    const canDrag = event.pointerType === 'mouse'
    const pointerId = event.pointerId
    let moved = false
    const tag = event.currentTarget.querySelector<HTMLElement>(`.${styles.tag}`)
    const rect = tag?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect()
    const offsetX = event.clientX - rect.left
    const offsetY = event.clientY - rect.top
    const from = { x: event.clientX, y: event.clientY }
    const size = { width: rect.width, height: rect.height }
    if (canDrag) setDrag({ personId, x: rect.left, y: rect.top, over: false, ...size })

    function trackMovement(pointerEvent: PointerEvent) {
      moved ||=
        Math.abs(pointerEvent.clientX - from.x) + Math.abs(pointerEvent.clientY - from.y) > TAP_SLOP
    }

    function move(moveEvent: PointerEvent) {
      if (moveEvent.pointerId !== pointerId) return
      trackMovement(moveEvent)
      if (!canDrag) return
      setDrag({
        personId,
        x: moveEvent.clientX - offsetX,
        y: moveEvent.clientY - offsetY,
        over: isOverSlot(moveEvent.clientX, moveEvent.clientY),
        ...size,
      })
    }

    function end(endEvent: PointerEvent) {
      if (endEvent.pointerId !== pointerId) return
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      setDrag(null)
      // LINEの最小化やスクロールに操作を引き渡した場合は確定しない。
      if (endEvent.type === 'pointercancel') return
      trackMovement(endEvent)
      // タップで差し込む。マウスだけは従来のドラッグも利用できる。
      if (!moved || (canDrag && isOverSlot(endEvent.clientX, endEvent.clientY))) fit(personId)
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }

  return { drag, slotRef, startDrag }
}
