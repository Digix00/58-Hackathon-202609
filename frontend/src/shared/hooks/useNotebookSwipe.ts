import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type MouseEvent,
  type TouchEvent,
} from 'react'

const SWIPE_THRESHOLD = 56
const SWIPE_SLOP = 8

type UseNotebookSwipeOptions = {
  canGoNext: boolean
  canGoPrevious: boolean
  onNext: (startAngle: number) => void
  onPrevious: () => void
}

/** ノートを横へ引いた距離に合わせ、めくり始めの角度を返す。 */
export function notebookAngleForDrag(distance: number) {
  return Math.max(-72, Math.min(0, distance * 0.42))
}

/** OS の動きを減らす設定を、紙をめくる側の画面で共通して参照する。 */
export function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** ノートの横スワイプ、ドラッグ表示、矢印キー操作を画面間で共通化する。 */
export function useNotebookSwipe({
  canGoNext,
  canGoPrevious,
  onNext,
  onPrevious,
}: UseNotebookSwipeOptions) {
  const [dragX, setDragX] = useState(0)
  const swipe = useRef<{ x: number; y: number; active: boolean } | null>(null)
  const swiped = useRef(false)

  function handleTouchStart(event: TouchEvent) {
    const touch = event.touches[0]
    swiped.current = false
    swipe.current = { x: touch.clientX, y: touch.clientY, active: false }
  }

  function handleTouchMove(event: TouchEvent) {
    const start = swipe.current
    if (!start) return
    const touch = event.touches[0]
    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    if (!start.active) {
      if (Math.abs(dx) < SWIPE_SLOP && Math.abs(dy) < SWIPE_SLOP) return
      // 縦に動かし始めたならスクロールとして扱い、横めくりには使わない。
      if (Math.abs(dy) >= Math.abs(dx)) {
        swipe.current = null
        return
      }
      start.active = true
    }
    setDragX(dx)
  }

  function handleTouchEnd(event: TouchEvent) {
    const start = swipe.current
    const dx = start ? event.changedTouches[0].clientX - start.x : 0
    swipe.current = null
    setDragX(0)
    if (!start?.active) return

    // 水平に払った後の click が、本文リンクを開かないようにする。
    swiped.current = true
    if (dx <= -SWIPE_THRESHOLD && canGoNext) onNext(notebookAngleForDrag(dx))
    else if (dx >= SWIPE_THRESHOLD && canGoPrevious) onPrevious()
  }

  function handleTouchCancel() {
    swipe.current = null
    swiped.current = false
    setDragX(0)
  }

  function handleLinkClick(event: MouseEvent) {
    if (!swiped.current) return
    swiped.current = false
    event.preventDefault()
  }

  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null
    if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return
    if (event.key === 'ArrowRight' && canGoNext) onNext(0)
    else if (event.key === 'ArrowLeft' && canGoPrevious) onPrevious()
  })

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return { dragX, handleTouchStart, handleTouchMove, handleTouchEnd, handleTouchCancel, handleLinkClick }
}
