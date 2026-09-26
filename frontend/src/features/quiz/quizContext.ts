import { createContext, useContext, useMemo } from 'react'
import { useDisplaySettings } from '../../app/providers/DisplaySettingsContext'
import { formatAttributes, type QuizPageModel, type QuizModelContext } from './quizViewModel'

export const QuizContext = createContext<QuizPageModel | null>(null)

/**
 * Intent: クイズ共有データの参照と言語別属性表示を局所化する。
 * Boundary: クイズのViewModelだけを返し、Contextに操作やサービスを置かない。
 * State Modeling: 取得結果のContextと表示言語を購読し、状態を複製しない。
 * Update Surface: なし。
 * Hidden Complexity: Provider外の呼び出しを拒否し、属性表示を純粋関数で変換する。
 * Composition: QuizExperienceから深い階層の紙・しおり・回答Hookへ伝播する。
 * Test Notes: 言語変更時の属性表示と選択肢順序の維持を確認する。
 */
export function useQuizData(): QuizModelContext {
  const value = useContext(QuizContext)
  const { language } = useDisplaySettings()

  return useMemo(() => {
    if (!value) throw new Error('QuizContext is not available')

    return {
      ...value,
      people: value.people.map((person) => ({
        ...person,
        attributes: formatAttributes(person.sourceAttributes, language),
      })),
    }
  }, [language, value])
}
