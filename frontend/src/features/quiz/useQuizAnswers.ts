import { useCallback, useState } from 'react'
import type { QuizAnswerResponse } from '../../lib/api'
import { assignmentsFromResult, type Answers, type Letter, type Person } from './quizViewModel'
import { placeAnswer, removeAnswer } from './quizAnswers'

/**
 * Intent: 手紙と参加者の対応編集を局所化し、回答ルールの変更を受け持つ。
 * Boundary: 選択肢・確定結果・編集可否から、対応と配置・取り外し操作だけを返す。
 * State Modeling: 対応表だけをuseStateで保持し、1人1枚の制約を純粋関数で保つ。
 * Update Surface: place / remove。reducerやsetterは公開しない。
 * Hidden Complexity: 確定結果の優先、重複配置の解消、未回答位置と送信形式の算出。
 * Composition: useQuizNavigationが送信可否を渡し、配置後の紙送りへ接続する。
 * Test Notes: 配置の移動、取り外し、回答済み・送信中の編集拒否、全回答を確認する。
 */
export function useQuizAnswers(
  people: Person[],
  letters: Letter[],
  result: QuizAnswerResponse | undefined,
  editable: boolean,
) {
  const [draft, setDraft] = useState<Answers>({})
  const answers = result ? assignmentsFromResult(result) : draft
  const answeredPersonIds = new Set(Object.values(answers))
  const remaining = people.filter((person) => !answeredPersonIds.has(person.id))
  const complete = letters.every((letter) => Boolean(answers[letter.id])) && remaining.length === 0

  const place = useCallback(
    (letterId: string, personId: string): number | null => {
      if (!editable || result || draft[letterId]) return null
      if (
        !letters.some((letter) => letter.id === letterId) ||
        !people.some((person) => person.id === personId)
      )
        return null
      const next = placeAnswer(draft, letterId, personId)
      setDraft(next)
      return letters.findIndex((letter) => !next[letter.id])
    },
    [draft, editable, letters, people, result],
  )

  const remove = useCallback(
    (letterId: string) => {
      if (!editable || result) return
      setDraft((current) => removeAnswer(current, letterId))
    },
    [editable, result],
  )

  return {
    answers,
    remaining,
    complete,
    matches: letters.flatMap((letter) =>
      answers[letter.id] ? [{ participantId: answers[letter.id], concernId: letter.id }] : [],
    ),
    place,
    remove,
  }
}
