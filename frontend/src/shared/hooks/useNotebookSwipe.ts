import {
  useEffect,
  useEffectEvent,
  useRef,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
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

/** ノートの横スワイプ、ドラッグ表示、矢印キー操作を画面間で共通化する。
 * Intent: ノートの横スワイプと左右キーによる移動を局所化する。
 * Boundary: 前後の移動可否とコールバックを受け取り、DOMイベントハンドラーを返す。
 * State Modeling: 描画を伴わないジェスチャー履歴とフレーム予約はrefで保持する。
 * Update Surface: タッチ・ポインタの開始・移動・終了・中断とリンククリックのハンドラー。
 * Hidden Complexity: 縦スクロールとの区別、指とマウスの二重処理の回避、スワイプ後の誤クリック抑止、入力欄のキー除外。
 * Composition: featureの移動Hookと紙面のDOMイベントを接続する。
 * Test Notes: 縦横の判定、中断、入力中の左右キー、購読解除を確認する。
 */
export function useNotebookSwipe({
  canGoNext,
  canGoPrevious,
  onNext,
  onPrevious,
}: UseNotebookSwipeOptions) {
  const swipe = useRef<{ x: number; y: number; active: boolean } | null>(null)
  const swiped = useRef(false)
  const dragTarget = useRef<HTMLElement | null>(null)
  const dragAngle = useRef<number | null>(null)
  const dragFrame = useRef<number | null>(null)

  function clearDrag() {
    if (dragFrame.current !== null) {
      window.cancelAnimationFrame(dragFrame.current)
      dragFrame.current = null
    }
    dragAngle.current = null
    dragTarget.current?.removeAttribute('data-notebook-dragging')
    dragTarget.current?.style.removeProperty('--notebook-drag-angle')
    dragTarget.current = null
  }

  function scheduleDrag(angle: number) {
    dragAngle.current = angle
    if (dragFrame.current !== null) return

    dragFrame.current = window.requestAnimationFrame(() => {
      dragFrame.current = null
      const target = dragTarget.current
      const nextAngle = dragAngle.current
      if (!target || nextAngle === null) return

      if (nextAngle === 0) {
        target.removeAttribute('data-notebook-dragging')
        target.style.removeProperty('--notebook-drag-angle')
        return
      }

      target.style.setProperty('--notebook-drag-angle', `${nextAngle}deg`)
      target.setAttribute('data-notebook-dragging', '')
    })
  }

  useEffect(
    () => () => {
      if (dragFrame.current !== null) window.cancelAnimationFrame(dragFrame.current)
      dragTarget.current?.removeAttribute('data-notebook-dragging')
      dragTarget.current?.style.removeProperty('--notebook-drag-angle')
    },
    [],
  )

  /** 引き始め。動かす紙は、受け取った紙面の中から拾う。 */
  function beginGesture(x: number, y: number, container: Element) {
    clearDrag()
    swiped.current = false
    swipe.current = { x, y, active: false }
    dragTarget.current = container.querySelector<HTMLElement>('[data-notebook-swipe-target]')
  }

  /** 引いているあいだ。紙を動かしたときだけ true を返す。 */
  function trackGesture(x: number, y: number) {
    const start = swipe.current
    if (!start) return false
    const dx = x - start.x
    const dy = y - start.y
    if (!start.active) {
      if (Math.abs(dx) < SWIPE_SLOP && Math.abs(dy) < SWIPE_SLOP) return false
      // 縦に動かし始めたならスクロールとして扱い、横めくりには使わない。
      if (Math.abs(dy) >= Math.abs(dx)) {
        swipe.current = null
        clearDrag()
        return false
      }
      start.active = true
    }
    scheduleDrag(dx < 0 ? notebookAngleForDrag(dx) : 0)
    return true
  }

  /** 手を離したとき。しきい値を越えていれば、そのままめくる。 */
  function finishGesture(x: number) {
    const start = swipe.current
    const dx = start ? x - start.x : 0
    // いま紙が向いている角度。ここからめくりを続ける。
    const angle = dragAngle.current ?? 0
    swipe.current = null
    clearDrag()
    if (!start?.active) return

    // 水平に払った後の click が、本文リンクや紙の角をもう一度動かさないようにする。
    swiped.current = true
    // 引いた角度をそのまま渡す。0度へ戻してから回すと、めくり直したように見える。
    if (dx <= -SWIPE_THRESHOLD && canGoNext) onNext(angle)
    else if (dx >= SWIPE_THRESHOLD && canGoPrevious) onPrevious()
  }

  function cancelGesture() {
    swipe.current = null
    swiped.current = false
    clearDrag()
  }

  function handleTouchStart(event: TouchEvent) {
    const touch = event.touches[0]
    beginGesture(touch.clientX, touch.clientY, event.currentTarget)
  }

  function handleTouchMove(event: TouchEvent) {
    const touch = event.touches[0]
    trackGesture(touch.clientX, touch.clientY)
  }

  function handleTouchEnd(event: TouchEvent) {
    finishGesture(event.changedTouches[0].clientX)
  }

  function handleTouchCancel() {
    cancelGesture()
  }

  /**
   * マウスで紙の角をつまんでめくる。
   *
   * 指は touch 側で扱うので、ここでは pointerType が touch のものを受け取らない。
   * 一度押したら、移動と終了は window で受ける。紙の外まで引いても、
   * 手を離すまでは同じ一続きの操作として追いたいため。
   */
  function handlePointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (event.pointerType === 'touch' || event.button !== 0 || !event.isPrimary) return
    const pointerId = event.pointerId
    beginGesture(event.clientX, event.clientY, event.currentTarget)

    function move(moveEvent: PointerEvent) {
      if (moveEvent.pointerId !== pointerId) return
      // 紙を引いているあいだは、本文が選択されないようにする。
      if (trackGesture(moveEvent.clientX, moveEvent.clientY)) moveEvent.preventDefault()
    }

    function end(endEvent: PointerEvent) {
      if (endEvent.pointerId !== pointerId) return
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      // 別の操作へ引き渡された場合は、めくらずに紙を戻す。
      if (endEvent.type === 'pointercancel') cancelGesture()
      else finishGesture(endEvent.clientX)
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
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

  return {
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleTouchCancel,
    handlePointerDown,
    handleLinkClick,
  }
}
