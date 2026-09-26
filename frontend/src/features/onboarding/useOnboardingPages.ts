import { useCallback, useEffect, useReducer } from 'react'
import { prefersReducedMotion } from '../../shared/hooks/useNotebookSwipe'
import { useStackLift } from '../../shared/hooks/useStackLift'
import { LAST_PAGE_INDEX, ONBOARDING_PAGES, type OnboardingPage } from './onboardingSteps'

/** 表紙を開くときに紙束の位置が落ち着く時間。フィードと同じ手つきにそろえる。 */
const COVER_LIFT_DURATION_MS = 760
const COVER_LIFT_SETTLE_MS = COVER_LIFT_DURATION_MS + 120

/** 問いの紙より前へは戻さない。表紙は読み返す紙ではない。 */
const FIRST_QUESTION_INDEX = 1

/**
 * めくっている最中の1枚。
 *
 * 進むときは「去っていく紙」を持つ。位置はすぐ進み、下から次の紙が現れる。
 * 戻るときは「降りてくる紙」を持ち、降りきるまで位置を動かさない。
 * 先に位置を動かすと、降りてくる紙と同じ問いが下にも見えてしまう。
 */
export type OnboardingTurn = {
  page: OnboardingPage
  index: number
  direction: 1 | -1
  startAngle: number
  /** 戻りのとき、降りきったら座る位置。進むときは null。 */
  settleTo: number | null
}

type OnboardingState = {
  index: number
  /** 表紙を押し上げている最中か。紙束が上がりきってからめくりはじめる。 */
  lifting: boolean
  /** 表紙をめくりはじめたか。最初の1枚は問いではなく表紙。 */
  opened: boolean
  turning: OnboardingTurn | null
}

type OnboardingAction =
  | { type: 'lifting' }
  | { type: 'next'; turning: OnboardingTurn | null }
  | { type: 'back'; index: number; turning: OnboardingTurn | null }
  | { type: 'turningFinished' }

const initialOnboardingState: OnboardingState = {
  index: 0,
  lifting: false,
  opened: false,
  turning: null,
}

/**
 * 戻りの紙がまだ降りきっていないときの、確定した位置。
 * 降りている途中で次の操作が来ても、位置がずれないようにする。
 */
function settledIndex(state: OnboardingState): number {
  return state.turning?.settleTo ?? state.index
}

function onboardingReducer(state: OnboardingState, action: OnboardingAction): OnboardingState {
  switch (action.type) {
    case 'lifting':
      return { ...state, lifting: true }
    case 'next':
      return {
        ...state,
        index: settledIndex(state) + 1,
        lifting: false,
        opened: true,
        turning: action.turning,
      }
    case 'back':
      return {
        ...state,
        index: action.turning ? settledIndex(state) : action.index,
        turning: action.turning,
      }
    case 'turningFinished':
      return { ...state, index: settledIndex(state), turning: null }
  }
}

/**
 * Intent: 初期登録の紙の位置とめくり順序を局所化する。
 * Boundary: 操作のロックだけを受け取り、表示値と前後移動・完了操作を返す。
 * State Modeling: 位置・表紙・めくりをreducerで同時更新する。入力と保存状態は保持しない。
 * Update Surface: goNext / goBack / onTurningFinished。
 * Hidden Complexity: 表紙を上げる待機、戻りの紙が降りるまでの位置保持、動きの省略。
 * Composition: useOnboardingNotebookが入力の完了条件を確認して移動を呼ぶ。
 * Test Notes: 表紙、最後の紙、戻りの確定、保存中の移動拒否を確認する。
 */
export function useOnboardingPages(locked: boolean) {
  const [state, dispatch] = useReducer(onboardingReducer, initialOnboardingState)
  const { index, lifting, opened, turning } = state
  const opening = lifting || opened
  const settled = settledIndex(state)
  const currentPage = ONBOARDING_PAGES[settled]
  /** 手前に見えている紙。戻りの紙が降りている間は、まだ前の紙が残っている。 */
  const facePage = ONBOARDING_PAGES[index]

  const { stackRef, rememberStackPosition } = useStackLift(
    opening,
    () => undefined,
    COVER_LIFT_DURATION_MS,
  )

  useEffect(() => {
    if (!lifting || prefersReducedMotion()) return

    // 紙束の位置が落ち着いてからめくる。押し上げとめくりを重ねない。
    const timer = window.setTimeout(() => {
      dispatch({
        type: 'next',
        turning: { page: 'cover', index: 0, direction: 1, startAngle: 0, settleTo: null },
      })
    }, COVER_LIFT_SETTLE_MS)
    return () => window.clearTimeout(timer)
  }, [lifting])

  const goNext = useCallback(
    (startAngle = 0) => {
      if (locked || settled >= LAST_PAGE_INDEX) return
      // 表紙が残っているうちは、めくる相手は問いではなく表紙。
      if (settled === 0) {
        if (prefersReducedMotion()) {
          dispatch({ type: 'next', turning: null })
          return
        }
        // ボタンからでも指からでも、まず紙束を押し上げる。めくるのはそのあと。
        if (!lifting) {
          rememberStackPosition()
          dispatch({ type: 'lifting' })
        }
        return
      }

      dispatch({
        type: 'next',
        turning: prefersReducedMotion()
          ? null
          : {
              page: currentPage,
              index: settled,
              direction: 1,
              startAngle,
              settleTo: null,
            },
      })
    },
    [currentPage, lifting, locked, rememberStackPosition, settled],
  )

  const goBack = useCallback(
    (target = settled - 1) => {
      if (locked) return
      if (target < FIRST_QUESTION_INDEX || target >= settled) return

      // 戻るときは、伏せてあった紙を拾い上げ、いま見ている紙の上へ降ろす。
      dispatch({
        type: 'back',
        index: target,
        turning: prefersReducedMotion()
          ? null
          : {
              page: ONBOARDING_PAGES[target],
              index: target,
              direction: -1,
              startAngle: 0,
              settleTo: target,
            },
      })
    },
    [locked, settled],
  )

  const onTurningFinished = useCallback(() => {
    dispatch({ type: 'turningFinished' })
  }, [])

  return {
    index,
    settledIndex: settled,
    facePage,
    currentPage,
    opened,
    /** 表紙を開きはじめたか。押し上げの時点から、本のまわりの飾りを動かす。 */
    opening,
    turning,
    stackRef,
    goNext,
    goBack,
    onTurningFinished,
  }
}
