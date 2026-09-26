import { useCallback, useEffectEvent, useLayoutEffect, useRef } from 'react'
import { prefersReducedMotion } from './useNotebookSwipe'

/**
 * 表紙を開くときに紙束が移動する時間。
 * 表紙を開く操作が消えたあと、紙束を新しい中央位置へ滑らかに移す。
 */
const LIFT_MS = 560

/**
 * 表紙を開くと、ふもとの表紙ボタンが消え、紙束が使える高さが変わる。
 *
 * 高さそのものを時間をかけて伸ばすと、毎フレーム版面を組み直すことになり、
 * クレヨンのふちを持つ紙が描き直されて動きがかすれる。
 * そこで組み直しは一度で終わらせ、紙束だけを元いた高さから transform で戻す。
 * 動かすのは合成だけなので、どの端末でも滑らかに上がる。
 *
 * 上がりきったら onLifted で知らせる。押し上げとめくりを重ねず、
 * 紙束が落ち着いてから表紙をめくるため。
 * Intent: 表紙を開いたときの紙束の位置補正を局所化する。
 * Boundary: 開閉・完了通知・時間を受け取り、DOM参照と位置記録操作を返す。
 * State Modeling: 描画に不要な直前位置はrefで保持する。
 * Update Surface: rememberStackPosition。
 * Hidden Complexity: 移動前後の計測、transition完了、動きを減らす設定を扱う。
 * Composition: 各featureの紙送りHookが開く直前に位置を記録する。
 * Test Notes: 位置差なし、動きの省略、完了通知、unmount時の購読解除を確認する。
 */
export function useStackLift(open: boolean, onLifted: () => void, duration = LIFT_MS) {
  const stackRef = useRef<HTMLDivElement | null>(null)
  const liftFrom = useRef<number | null>(null)
  const lifted = useEffectEvent(onLifted)

  /** 動かす直前の高さを控える。組み直しのあと、ここへ一度戻してから動かす。 */
  const rememberStackPosition = useCallback(() => {
    liftFrom.current = prefersReducedMotion()
      ? null
      : (stackRef.current?.getBoundingClientRect().top ?? null)
  }, [])

  // open が変わった回だけ動かす。控えた高さがなければ、何もせず見送る。
  useLayoutEffect(() => {
    const node = stackRef.current
    const from = liftFrom.current
    liftFrom.current = null
    if (!node || from === null) return

    const delta = from - node.getBoundingClientRect().top
    const onEnd = (event: TransitionEvent) => {
      // 紙の上で起きた別のうつろいは数えない。
      if (event.target !== node || event.propertyName !== 'transform') return
      node.removeEventListener('transitionend', onEnd)
      node.style.willChange = ''
      node.style.removeProperty('--lift')
      node.style.removeProperty('--lift-duration')
      lifted()
    }

    // 紙束の位置が変わらなくても、めくり始めるまでの時間は確保する。
    if (Math.abs(delta) < 1) {
      node.style.setProperty('--lift-duration', `${duration}ms`)
      const timer = window.setTimeout(() => {
        node.style.removeProperty('--lift-duration')
        lifted()
      }, duration)
      return () => {
        window.clearTimeout(timer)
      }
    }

    node.style.willChange = 'transform'
    node.style.setProperty('--lift', `${delta}px`)
    // ここで一度位置を確定させないと、元の高さを飛ばして新しい高さへ跳ぶ。
    void node.offsetHeight
    node.style.setProperty('--lift-duration', `${duration}ms`)
    node.style.setProperty('--lift', '0px')
    node.addEventListener('transitionend', onEnd)
    return () => node.removeEventListener('transitionend', onEnd)
  }, [duration, open])

  return { stackRef, rememberStackPosition }
}
