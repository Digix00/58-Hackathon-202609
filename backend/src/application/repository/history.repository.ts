import type {
  HistoryNextSuggestion,
  HistorySummaryStats,
  QuizAnswerHistoryCursor,
  QuizAnswerHistoryPage,
} from "../entity/history";

export interface HistoryRepository {
  isUserDeleted(userId: string): Promise<boolean>;
  getSummaryStats(userId: string): Promise<HistorySummaryStats>;
  getNextSuggestion(userId: string): Promise<HistoryNextSuggestion | null>;
  listQuizAnswers(
    userId: string,
    limit: number,
    cursor: QuizAnswerHistoryCursor | null,
  ): Promise<QuizAnswerHistoryPage>;
}
