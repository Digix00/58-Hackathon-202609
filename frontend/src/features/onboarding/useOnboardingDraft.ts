import { useCallback, useState } from 'react'
import { emptyOnboardingDraft, type OnboardingFieldUpdate } from './onboardingSteps'

/**
 * Intent: 初期登録で入力する4項目を局所化する。
 * Boundary: 下書きと型付きの項目更新だけを公開する。
 * State Modeling: 同じフォームの単純なまとまりなのでuseStateを使う。
 * Update Surface: changeField。
 * Hidden Complexity: 更新した項目以外は維持する。保存やページ位置には依存しない。
 * Composition: useOnboardingNotebookが移動条件と保存入力へ接続する。
 * Test Notes: 各項目の変更、ページを戻ったときの入力保持を確認する。
 */
export function useOnboardingDraft() {
  const [draft, setDraft] = useState(emptyOnboardingDraft)
  const changeField = useCallback((update: OnboardingFieldUpdate) => {
    setDraft((current) => ({ ...current, [update.field]: update.value }))
  }, [])
  return { draft, changeField }
}
