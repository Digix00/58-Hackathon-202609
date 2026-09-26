import type { QuizAnswerResponse, TodayQuizResponse } from '../../lib/api'
import type { DisplayLanguage } from '../../app/providers/DisplaySettingsContext'
import { ageGroupLabel, genderLabel, regionLabel } from '../../shared/concernPresentation.ts'
import { translate } from '../../i18n/translate.ts'

export type Letter = { id: string; body: string; language: DisplayLanguage }
export type QuizParticipant = {
  id: string
  sourceAttributes: TodayQuizResponse['participants'][number]['attributes']
  color: string
}
export type Person = QuizParticipant & { attributes: string }
export type QuizPageModel = {
  id: string
  people: QuizParticipant[]
  letters: Letter[]
  answerResult?: QuizAnswerResponse
}
export type Answers = Record<string, string>
export type QuizModelContext = Omit<QuizPageModel, 'people'> & { people: Person[] }

const PIECE_COLORS = ['#f9e7ac', '#cde5dc', '#e3dafa'] as const

export function formatAttributes(
  attributes: TodayQuizResponse['participants'][number]['attributes'],
  language: DisplayLanguage,
) {
  const { ageGroup, gender, regionCode } = attributes
  const region =
    regionCode === 'no_answer'
      ? translate(language, 'common.noAnswer')
      : regionLabel(regionCode, language)
  return [ageGroupLabel(ageGroup, language), genderLabel(gender, language), region]
    .filter((label): label is string => Boolean(label))
    .join(language === 'en' ? ' · ' : '・')
}

export function toQuizPageModel(quiz: TodayQuizResponse): QuizPageModel {
  const people = [...quiz.participants]
    .sort((left, right) => left.displayOrder - right.displayOrder)
    .map((participant, index) => ({
      id: participant.participantId,
      sourceAttributes: participant.attributes,
      color: PIECE_COLORS[index % PIECE_COLORS.length],
    }))
  const letters = [...quiz.concerns]
    .sort((left, right) => left.displayOrder - right.displayOrder)
    .map((concern) => ({ id: concern.concernId, body: concern.body, language: concern.language }))

  return { id: quiz.id, people, letters, answerResult: quiz.answerResult }
}

export function hasThreeUniqueQuizItems(quiz: TodayQuizResponse) {
  return (
    quiz.participants.length === 3 &&
    quiz.concerns.length === 3 &&
    new Set(quiz.participants.map((participant) => participant.participantId)).size === 3 &&
    new Set(quiz.concerns.map((concern) => concern.concernId)).size === 3
  )
}

export function assignmentsFromResult(result: QuizAnswerResponse | undefined): Answers {
  if (!result) return {}
  return Object.fromEntries(
    result.results.map((item) => [item.selectedConcernId, item.participantId]),
  )
}
