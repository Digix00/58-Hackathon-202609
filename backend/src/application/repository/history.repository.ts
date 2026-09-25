import type {
  HistorySummaryStats,
  QuizAnswerHistoryCursor,
  QuizAnswerHistoryPage,
} from "../entity/history";

export interface HistoryRepository {
  isUserDeleted(userId: string): Promise<boolean>;
  getSummaryStats(userId: string): Promise<HistorySummaryStats>;
  listQuizAnswers(
    userId: string,
    limit: number,
    cursor: QuizAnswerHistoryCursor | null,
  ): Promise<QuizAnswerHistoryPage>;
}
