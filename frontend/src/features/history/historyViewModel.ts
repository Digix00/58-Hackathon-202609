import type { HistorySummaryResponse, QuizAnswerHistoryResponse } from '../../lib/api'
import { ageGroupLabel, genderLabel, regionLabel } from '../../shared/concernPresentation'

export interface HistoryViewModel {
  viewedCount: number
  clusters: Array<{ id: string; label: string; count: number }>
  regions: Array<{ code: string; label: string; count: number }>
  ageGroups: Array<{ label: string; count: number }>
  genders: Array<{ label: string; count: number }>
  quiz: HistorySummaryResponse['quiz']
  quizAnswers: QuizAnswerHistoryResponse['items']
  quizAnswersNextCursor: string | null
}

export function toHistoryViewModel(
  summary: HistorySummaryResponse,
  quizAnswers: QuizAnswerHistoryResponse,
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
      label: regionLabel(region.regionCode) ?? region.regionCode,
      count: region.count,
    })),
    ageGroups: summary.attributes.ageGroups.map((item) => ({
      label: ageGroupLabel(item.ageGroup) ?? item.ageGroup,
      count: item.count,
    })),
    genders: summary.attributes.genders.map((item) => ({
      label: genderLabel(item.gender) ?? item.gender,
      count: item.count,
    })),
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
