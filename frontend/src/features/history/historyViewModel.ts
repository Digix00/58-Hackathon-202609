import type {
  HistoryConcernsResponse,
  HistorySummaryResponse,
  QuizAnswerHistoryResponse,
} from '../../lib/api'
import {
  ageGroupLabel,
  createdLabel,
  genderLabel,
  regionLabel,
} from '../../shared/concernPresentation'
import type { DisplayLanguage } from '../../app/providers/DisplaySettingsContext'

export interface HistoryViewModel {
  viewedCount: number
  contributions: HistorySummaryResponse['contributions']
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
    contributions: summary.contributions,
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

/** 履歴の一覧に並ぶ1件の声。本文は抜粋として読み、続きは投稿詳細で読む。 */
export interface HistoryVoiceView {
  id: string
  body: string
  language: DisplayLanguage
  translationStatus?: 'pending' | 'ready' | 'failed'
  /** テーマのしおり。分類が生成される前は null。 */
  theme: string | null
  ageGroup?: string
  region?: string
  /** 書いた日、または寄りそった日の相対表記。 */
  whenLabel: string
  reactionCount: number
  /** 本人にだけ見える状態。公開済み・処理済みなら 'published'。 */
  state: 'published' | 'hidden' | 'preparing'
}

/** 寄りそった声は寄りそった日を、書いた声は書いた日を時間の軸にする。 */
export function toHistoryVoices(
  page: HistoryConcernsResponse,
  language: DisplayLanguage = 'original',
): HistoryVoiceView[] {
  return page.items.map((item) => ({
    id: item.id,
    body: item.body,
    language: item.language,
    translationStatus: language === 'original' ? undefined : item.representations[language],
    theme: item.cluster?.label ?? null,
    ageGroup: item.attributes.ageGroupName ?? ageGroupLabel(item.attributes.ageGroup, language),
    region: item.attributes.regionName ?? regionLabel(item.attributes.regionCode, language),
    whenLabel: createdLabel(item.reactedAt ?? item.createdAt, language),
    reactionCount: item.reactionCount,
    state: voiceState(item.visibilityStatus, item.processingStatus),
  }))
}

function voiceState(visibilityStatus: string, processingStatus: string): HistoryVoiceView['state'] {
  if (visibilityStatus !== 'published') return 'hidden'
  if (processingStatus === 'pending' || processingStatus === 'processing') return 'preparing'
  return 'published'
}
