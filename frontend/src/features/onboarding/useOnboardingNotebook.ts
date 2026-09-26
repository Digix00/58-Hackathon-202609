import { useCallback, useEffect, useReducer } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../../auth/useAuth'
import { prefersReducedMotion, useNotebookSwipe } from '../../shared/hooks/useNotebookSwipe'
import { useStackLift } from '../../shared/hooks/useStackLift'
import { updateUserProfile, type Gender } from '../profile/profileApi'
import {
  LAST_PAGE_INDEX,
  ONBOARDING_PAGES,
  emptyOnboardingDraft,
  isPageAnswered,
  toUserProfileInput,
  type OnboardingDraft,
  type OnboardingFieldUpdate,
  type OnboardingPage,
} from './onboardingSteps'

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

type OnboardingStatus = 'idle' | 'saving' | 'failed'

type OnboardingState = {
  draft: OnboardingDraft
  index: number
  /** 表紙を押し上げている最中か。紙束が上がりきってからめくりはじめる。 */
  lifting: boolean
  /** 表紙をめくりはじめたか。最初の1枚は問いではなく表紙。 */
  opened: boolean
  turning: OnboardingTurn | null
  status: OnboardingStatus
  error: string | null
}

type OnboardingAction =
  | { type: 'fieldChanged'; update: OnboardingFieldUpdate }
  | { type: 'lifting' }
  | { type: 'next'; turning: OnboardingTurn | null; update?: OnboardingFieldUpdate }
  | { type: 'back'; index: number; turning: OnboardingTurn | null }
  | { type: 'turningFinished' }
  | { type: 'saveStarted' }
  | { type: 'saveFailed'; message: string }

const initialOnboardingState: OnboardingState = {
  draft: emptyOnboardingDraft,
  index: 0,
  lifting: false,
  opened: false,
  turning: null,
  status: 'idle',
  error: null,
}

/**
 * 戻りの紙がまだ降りきっていないときの、確定した位置。
 * 降りている途中で次の操作が来ても、位置がずれないようにする。
 */
function settledIndex(state: OnboardingState): number {
  return state.turning?.settleTo ?? state.index
}

function applyUpdate(
  draft: OnboardingDraft,
  update: OnboardingFieldUpdate | undefined,
): OnboardingDraft {
  return update ? { ...draft, [update.field]: update.value } : draft
}

function onboardingReducer(state: OnboardingState, action: OnboardingAction): OnboardingState {
  switch (action.type) {
    case 'fieldChanged':
      // 書き直したら、前の送信結果は消す。古い結果を残すと直したことが伝わらない。
      return {
        ...state,
        draft: applyUpdate(state.draft, action.update),
        status: state.status === 'failed' ? 'idle' : state.status,
        error: null,
      }
    case 'lifting':
      return { ...state, lifting: true }
    case 'next':
      return {
        ...state,
        draft: applyUpdate(state.draft, action.update),
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
    case 'saveStarted':
      return { ...state, status: 'saving', error: null }
    case 'saveFailed':
      return { ...state, status: 'failed', error: action.message }
  }
}

/**
 * Intent: はじめの1ページを書く紙の並び、めくり、書いた内容の保存を局所化する。
 * Boundary: いま見えている紙、しおりに出す下書き、めくり・入力・保存の操作だけを公開する。
 * State modeling: 位置・めくり・下書き・保存を1つの reducer に集約し、
 *   めくっている最中に位置と下書きがずれないようにする。
 * Update surface: updateField、chooseGender、goNext、goBack、submit。
 * Hidden complexity: 表紙の押し上げとめくりの順番、戻りの紙が降りきるまでの位置の据え置き、
 *   OS の動きを減らす設定でのめくり省略。
 */
export function useOnboardingNotebook() {
  const navigate = useNavigate()
  const { refresh } = useAuth()
  const [state, dispatch] = useReducer(onboardingReducer, initialOnboardingState)
  const { draft, index, lifting, opened, turning, status, error } = state
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

  const advance = useCallback(
    (startAngle: number, update?: OnboardingFieldUpdate) => {
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
        update,
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
    [currentPage, lifting, rememberStackPosition, settled],
  )

  const canGoNext =
    settled < LAST_PAGE_INDEX && isPageAnswered(currentPage, draft) && status !== 'saving'
  const canGoBack = settled > FIRST_QUESTION_INDEX && status !== 'saving'

  const goNext = useCallback(
    (startAngle = 0) => {
      if (!canGoNext) return
      advance(startAngle)
    },
    [advance, canGoNext],
  )

  const goBack = useCallback(
    (target = settled - 1) => {
      if (status === 'saving') return
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
    [settled, status],
  )

  const swipe = useNotebookSwipe({
    canGoNext,
    canGoPrevious: canGoBack,
    onNext: advance,
    onPrevious: goBack,
  })

  const updateField = useCallback((update: OnboardingFieldUpdate) => {
    dispatch({ type: 'fieldChanged', update })
  }, [])

  /** 選ぶことが答えなので、選んだ手でそのまま次の紙へめくる。 */
  const chooseGender = useCallback(
    (value: Gender) => {
      advance(0, { field: 'gender', value })
    },
    [advance],
  )

  const onTurningFinished = useCallback(() => {
    dispatch({ type: 'turningFinished' })
  }, [])

  const submit = useCallback(async (): Promise<void> => {
    if (status === 'saving') return

    const input = toUserProfileInput(draft)
    if (!input) return

    dispatch({ type: 'saveStarted' })
    try {
      const result = await updateUserProfile(input)
      if (!result.ok) {
        dispatch({ type: 'saveFailed', message: result.message })
        return
      }

      // profileCompleted を取り直してから移る。取り直す前に移ると、また案内へ戻される。
      await refresh()
      navigate('/', { replace: true })
    } catch {
      dispatch({
        type: 'saveFailed',
        message: 'はじめの1ページを書き込めませんでした。もう一度お試しください。',
      })
    }
  }, [draft, navigate, refresh, status])

  return {
    draft,
    index,
    facePage,
    currentPage,
    opened,
    turning,
    saving: status === 'saving',
    error,
    canGoNext,
    canGoBack,
    stackRef,
    swipe,
    updateField,
    chooseGender,
    goNext,
    goBack,
    onTurningFinished,
    submit,
  }
}
