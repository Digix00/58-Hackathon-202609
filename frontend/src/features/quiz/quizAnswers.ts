import type { Answers } from './quizViewModel'

/** 1人1枚のしおりを移し、他の手紙との重複を構造的に取り除く。 */
export function placeAnswer(answers: Answers, letterId: string, personId: string): Answers {
  return {
    ...Object.fromEntries(Object.entries(answers).filter(([, person]) => person !== personId)),
    [letterId]: personId,
  }
}

export function removeAnswer(answers: Answers, letterId: string): Answers {
  return Object.fromEntries(Object.entries(answers).filter(([letter]) => letter !== letterId))
}
