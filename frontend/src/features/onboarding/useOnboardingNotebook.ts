import { useCallback } from 'react'
import { useNavigate } from 'react-router'
import { useNotebookSwipe } from '../../shared/hooks/useNotebookSwipe'
import type { Gender } from '../profile/profileApi'
import {
  LAST_PAGE_INDEX,
  isPageAnswered,
  toUserProfileInput,
  type OnboardingFieldUpdate,
} from './onboardingSteps'
import { useOnboardingDraft } from './useOnboardingDraft'
import { useOnboardingSubmit } from './useOnboardingSubmit'
import { useOnboardingPages } from './useOnboardingPages'
export type { OnboardingTurn } from './useOnboardingPages'

/**
 * Intent: 初期登録の入力・紙送り・保存を、利用者の操作として合成する。
 * Boundary: 画面が描く値と、入力・移動・保存操作だけを返す。
 * State Modeling: 入力はdraft、移動はpages、保存状態はsubmissionにそれぞれ閉じる。
 * Update Surface: updateField / chooseGender / goNext / goBack / onTurningFinished / submit。
 * Hidden Complexity: 入力済みの紙だけ進めること、保存成功後だけフィードへ移る順序。
 * Composition: useOnboardingDraft / useOnboardingPages / useOnboardingSubmitを接続する。
 * Test Notes: 未入力での移動拒否、性別選択と移動、保存失敗時の入力保持と再試行を確認する。
 */
export function useOnboardingNotebook() {
  const navigate = useNavigate()
  const submission = useOnboardingSubmit()
  const { draft, changeField } = useOnboardingDraft()
  const pages = useOnboardingPages(submission.saving)
  const { saving, clearError } = submission
  const { goNext: advance, currentPage } = pages
  const canGoNext =
    pages.settledIndex < LAST_PAGE_INDEX && isPageAnswered(pages.currentPage, draft) && !saving
  const canGoBack = pages.settledIndex > 1 && !saving

  const updateField = useCallback(
    (update: OnboardingFieldUpdate) => {
      if (saving) return
      changeField(update)
      clearError()
    },
    [changeField, saving, clearError],
  )

  const goNext = useCallback(
    (startAngle = 0) => {
      if (canGoNext) advance(startAngle)
    },
    [canGoNext, advance],
  )

  const chooseGender = useCallback(
    (value: Gender) => {
      if (saving || currentPage !== 'gender') return
      updateField({ field: 'gender', value })
      advance()
    },
    [currentPage, advance, saving, updateField],
  )

  const swipe = useNotebookSwipe({
    canGoNext,
    canGoPrevious: canGoBack,
    onNext: goNext,
    onPrevious: pages.goBack,
  })
  const submit = async () => {
    const input = toUserProfileInput(draft)
    if (input && (await submission.submit(input))) navigate('/', { replace: true })
  }

  return {
    draft,
    index: pages.index,
    facePage: pages.facePage,
    currentPage: pages.currentPage,
    opened: pages.opened,
    opening: pages.opening,
    turning: pages.turning,
    stackRef: pages.stackRef,
    saving: saving,
    error: submission.error,
    canGoNext,
    canGoBack,
    swipe,
    updateField,
    chooseGender,
    goNext,
    goBack: pages.goBack,
    onTurningFinished: pages.onTurningFinished,
    submit,
  }
}
