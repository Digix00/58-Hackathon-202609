import type { Concern } from "./concern";
import type { ConcernCluster } from "./concern-cluster";

export interface HistoryCount<T extends string> {
  value: T;
  count: number;
}

export interface HistoryClusterCount {
  clusterId: string;
  label: string;
  count: number;
}

/** 自分が書いた声と、寄りそいのやりとりの件数。 */
export interface HistoryContributionStats {
  concernCount: number;
  receivedReactionCount: number;
  givenReactionCount: number;
}

export interface HistorySummaryStats {
  viewedConcernCount: number;
  contributions: HistoryContributionStats;
  clusters: HistoryClusterCount[];
  regions: Array<{ regionCode: string; count: number }>;
  attributes: {
    ageGroups: Array<{ ageGroup: string; count: number }>;
    genders: Array<{ gender: string; count: number }>;
  };
  quiz: {
    answeredCount: number;
    correctCount: number;
    totalQuestions: number;
  };
}

export type HistoryNextSuggestion =
  | { kind: "theme"; label: string }
  | { kind: "region"; regionCode: string };

export interface HistorySummary extends HistorySummaryStats {
  nextSuggestion: HistoryNextSuggestion | null;
  quiz: HistorySummaryStats["quiz"] & { accuracy: number };
}

export interface QuizAnswerHistoryCursor {
  answeredAt: string;
  quizId: string;
}

export interface QuizAnswerHistoryItem {
  quizId: string;
  quizDate: string;
  score: number;
  total: number;
  answeredAt: string;
}

export interface QuizAnswerHistoryPage {
  items: QuizAnswerHistoryItem[];
  nextCursor: QuizAnswerHistoryCursor | null;
}

/**
 * 履歴として1件ずつ読み返す投稿。自分が書いた声と、寄りそった声の両方を表す。
 * 投稿本体はConcernのまま持ち、表示言語の選択とマスキングは presentation 層で行う。
 */
export interface HistoryConcernEntry {
  concern: Concern;
  cluster: ConcernCluster | null;
  reactionCount: number;
  /** 寄りそった日時。自分が書いた声の一覧では null とする。 */
  reactedAt: string | null;
}

/** 並び順の基準となる日時（投稿日時または寄りそった日時）と投稿IDの組。 */
export interface HistoryConcernCursor {
  sortedAt: string;
  concernId: string;
}

export interface HistoryConcernPage {
  items: HistoryConcernEntry[];
  nextCursor: HistoryConcernCursor | null;
}
