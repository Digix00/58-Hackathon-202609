import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { prefersReducedMotion } from '../../shared/hooks/useNotebookSwipe'

/**
 * 起動画面の3幕。
 *
 * drawing  線が引かれ、色が入り、シールが貼られるまで。
 * waiting  描き終えた絵のまま、準備が終わるのを待つ。
 * leaving  絵を持ち上げて抜き、方眼の紙だけを残す。
 */
export type SplashPhase = 'drawing' | 'waiting' | 'leaving'

/** 第1幕と第2幕を描き切るまで。これがスプラッシュの最低表示時間になる。 */
const DRAW_MS = 1000

/**
 * 待っていることを文字で言うまでの間。
 *
 * これより早く準備が終わる回では文字を出さない。出してすぐ消える文字は、
 * 読む間がないまま画面が動いたようにしか見えない。
 */
const HINT_MS = 1600

/** 退場。絵が抜けるだけなので、紙をめくるより短く済ませる。 */
const LEAVE_MS = 320

/** 早送りの倍率。描き切る前に準備が終わったとき、残りをこの速さで流す。 */
const FAST_RATE = 1.8

/**
 * 流れているアニメーションを、いまの位置を保ったまま早送りする。
 *
 * animation-duration を差し替えると、経過時間はそのままで割合だけが動くため、
 * 絵が一度巻き戻ったように跳ぶ。再生速度だけを変えれば、引いている線も
 * 貼られかけのシールも、途中から速くなるだけで済む。
 */
function speedUp(root: HTMLElement | null) {
  if (!root || typeof root.getAnimations !== 'function') return

  for (const animation of root.getAnimations({ subtree: true })) {
    // updatePlaybackRate は速さの変化をならす。ない環境では直接差し替える。
    if (typeof animation.updatePlaybackRate === 'function') {
      animation.updatePlaybackRate(FAST_RATE)
    } else {
      animation.playbackRate = FAST_RATE
    }
  }
}

/**
 * Intent: 起動画面の幕送りと、準備完了後の退場までを局所化する。
 * Boundary: 準備が終わったかどうかだけを受け取り、幕と待機の文言だけを返す。
 * State modeling: 持つ状態は「描き切ったか」だけにし、幕はそこから導く。
 *   準備が終わったから退場する、を状態遷移として持つと、描き切る前に
 *   準備が終わった回で、描いている途中から退場へ飛べてしまう。
 * Hidden complexity: 最低表示時間の保証、残り時間の早送り、退場の待ち合わせ。
 */
export function useSplashPresentation(ready: boolean, onDone: () => void) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  // 動きを控える設定では描く時間を持たない。描き終えた絵として始める。
  const [drawn, setDrawn] = useState(prefersReducedMotion)
  const [hint, setHint] = useState(false)
  const drawStartedAt = useRef(0)
  const finished = useEffectEvent(onDone)

  /*
   * 描き切るまでは、準備が終わっても幕は drawing のまま。
   * 描き切ったあとは、準備が終わっているかどうかがそのまま幕になる。
   */
  const phase: SplashPhase = !drawn ? 'drawing' : ready ? 'leaving' : 'waiting'

  // 第1幕・第2幕。準備が先に終わっていれば、残りを早送りする。
  useEffect(() => {
    if (drawn) return

    if (drawStartedAt.current === 0) drawStartedAt.current = performance.now()
    const remaining = Math.max(0, DRAW_MS - (performance.now() - drawStartedAt.current))

    if (ready) speedUp(rootRef.current)
    const timer = window.setTimeout(() => setDrawn(true), ready ? remaining / FAST_RATE : remaining)
    return () => window.clearTimeout(timer)
  }, [drawn, ready])

  // 退場。抜けきってから、本来の画面へ渡す。
  useEffect(() => {
    if (phase !== 'leaving') return

    const timer = window.setTimeout(finished, prefersReducedMotion() ? 0 : LEAVE_MS)
    return () => window.clearTimeout(timer)
  }, [phase])

  // 待機の文言は起動からの時間で決める。幕が変わるたびに数え直さない。
  useEffect(() => {
    const timer = window.setTimeout(() => setHint(true), HINT_MS)
    return () => window.clearTimeout(timer)
  }, [])

  return { rootRef, phase, hint: hint && phase !== 'leaving' }
}
