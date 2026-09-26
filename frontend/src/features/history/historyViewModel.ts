import type { HistorySummaryResponse, QuizAnswerHistoryResponse } from '../../lib/api'
import { ageGroupLabel, genderLabel, regionLabel } from '../../shared/concernPresentation'
import type { DisplayLanguage } from '../../app/providers/DisplaySettingsContext'

export interface HistoryViewModel {
  viewedCount: number
  clusters: Array<{ id: string; label: string; count: number }>
  regions: Array<{ code: string; label: string; count: number }>
  ageGroups: Array<{ label: string; count: number }>
  genders: Array<{ label: string; count: number }>
  nextSuggestion: { kind: 'theme'; label: string } | { kind: 'region'; label: string } | null
  quiz: HistorySummaryResponse['quiz']
  quizAnswers: QuizAnswerHistoryResponse['items']
  quizAnswersNextCursor: string | null
}

export function toHistoryViewModel(
  summary: HistorySummaryResponse,
  quizAnswers: QuizAnswerHistoryResponse,
  language: DisplayLanguage = 'original',
): HistoryViewModel {
  return {
    viewedCount: summary.viewedConcernCount,
    clusters: summary.clusters.map((cluster) => ({
      id: cluster.clusterId,
      label: cluster.label,
      count: cluster.count,
    })),
    regions: summary.regions.map((region) => ({
      code: region.regionCode,
      label: regionLabel(region.regionCode, language) ?? region.regionCode,
      count: region.count,
    })),
    ageGroups: summary.attributes.ageGroups.map((item) => ({
      label: ageGroupLabel(item.ageGroup, language) ?? item.ageGroup,
      count: item.count,
    })),
    genders: summary.attributes.genders.map((item) => ({
      label: genderLabel(item.gender, language) ?? item.gender,
      count: item.count,
    })),
    nextSuggestion: summary.nextSuggestion
      ? summary.nextSuggestion.kind === 'theme'
        ? summary.nextSuggestion
        : {
            kind: 'region',
            label:
              regionLabel(summary.nextSuggestion.regionCode, language) ??
              summary.nextSuggestion.regionCode,
          }
      : null,
    quiz: summary.quiz,
    quizAnswers: quizAnswers.items,
    quizAnswersNextCursor: quizAnswers.nextCursor,
  }
}

export function appendQuizAnswers(
  viewModel: HistoryViewModel,
  page: QuizAnswerHistoryResponse,
): HistoryViewModel {
  return {
    ...viewModel,
    quizAnswers: [...viewModel.quizAnswers, ...page.items],
    quizAnswersNextCursor: page.nextCursor,
  }
}
