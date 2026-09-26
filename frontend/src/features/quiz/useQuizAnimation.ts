import { useCallback, useEffect, useRef, useState } from 'react'
import { useStackLift } from '../../shared/hooks/useStackLift'
import type { Letter } from './quizViewModel'

export type TurningState =
  | { kind: 'cover'; startAngle: number; direction: 1 | -1 }
  | {
      kind: 'letter'
      letter: Letter
      personId?: string
      startAngle: number
      direction: 1 | -1
      /** 戻すめくりの行き先。付箋から前の手紙へ跳ぶときだけ入る。 */
      toIndex?: number
    }

const SETTLE_MS = 600

/**
 * Intent: 紙送りのアニメーションと、回答後に次の紙へ移る待ち時間を局所化する。
 * Boundary: 表紙の状態を受け取り、紙束参照・紙送り操作・settle待ち操作だけを返す。
 * Hidden complexity: アニメーション中の紙とsettle timerを同時に一つだけ保持し、unmount時に待ち時間を破棄する。
 * State Modeling: めくっている紙だけをuseState、待機予約をrefに保持する。
 * Update Surface: beginTurn / clearTurning / scheduleSettle / cancelSettle / rememberStackPosition。
 * Composition: useQuizNavigationが紙の位置操作とアニメーション完了を接続する。
 * Test Notes: 待機の取消し、前後の紙送り、表紙の押し上げ完了を確認する。
 */
export function useQuizAnimation(
  coverOpening: boolean,
  coverLifting: boolean,
  onCoverLifted: () => void,
) {
  /** いまめくられている最中の1枚。裏返り終わるまで、新しい紙の上に重ねて描く。 */
  const [turning, setTurning] = useState<TurningState | null>(null)

  /**
   * 差し込んでから紙がめくれるまでの、待ちの札。
   * 待っている間に自分でめくったり、しおりを抜いたりしたら、この札は破る。
   */
  const settle = useRef<number | null>(null)
  const cancelSettle = useCallback(() => {
    if (settle.current === null) return
    window.clearTimeout(settle.current)
    settle.current = null
  }, [])

  useEffect(() => cancelSettle, [cancelSettle])

  const beginTurn = useCallback((next: TurningState) => setTurning(next), [])
  const clearTurning = useCallback(() => setTurning(null), [])

  const scheduleSettle = useCallback(
    (onSettled: () => void) => {
      cancelSettle()
      settle.current = window.setTimeout(() => {
        settle.current = null
        onSettled()
      }, SETTLE_MS)
    },
    [cancelSettle],
  )

  const handleCoverLifted = useCallback(() => {
    // 紙束が上がりきった。ここでようやく表紙に手をかける。
    if (!coverLifting) return
    beginTurn({ kind: 'cover', startAngle: 0, direction: 1 })
    onCoverLifted()
  }, [beginTurn, coverLifting, onCoverLifted])

  const { stackRef, rememberStackPosition } = useStackLift(coverOpening, handleCoverLifted)

  return {
    turning,
    stackRef,
    rememberStackPosition,
    beginTurn,
    clearTurning,
    cancelSettle,
    scheduleSettle,
  }
}
