export interface HistoryCount<T extends string> {
  value: T;
  count: number;
}

export interface HistoryClusterCount {
  clusterId: string;
  label: string;
  count: number;
}

export interface HistorySummaryStats {
  viewedConcernCount: number;
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
