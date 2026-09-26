import type {
  HistorySummary,
  QuizAnswerHistoryCursor,
  QuizAnswerHistoryPage,
} from "../entity/history";
import type { HistoryRepository } from "../repository/history.repository";

export interface IHistoryUseCase {
  getSummary(userId: string): Promise<HistorySummary>;
  listQuizAnswers(
    userId: string,
    limit: number,
    cursor: QuizAnswerHistoryCursor | null,
  ): Promise<QuizAnswerHistoryPage>;
}

export class HistoryUserDeletedError extends Error {
  constructor() {
    super("deleted user cannot access learning history");
    this.name = "HistoryUserDeletedError";
  }
}

/** 認証済み利用者自身の学習履歴を取得するUseCase。 */
export class HistoryUseCase implements IHistoryUseCase {
  private readonly repository: HistoryRepository;

  constructor(repository: HistoryRepository) {
    this.repository = repository;
  }

  readonly getSummary = async (userId: string): Promise<HistorySummary> => {
    await this.assertUserCanRead(userId);
    const [stats, nextSuggestion] = await Promise.all([
      this.repository.getSummaryStats(userId),
      this.repository.getNextSuggestion(userId),
    ]);
    const accuracy =
      stats.quiz.totalQuestions === 0
        ? 0
        : Math.round(
            (stats.quiz.correctCount / stats.quiz.totalQuestions) * 10_000,
          ) / 10_000;

    return { ...stats, nextSuggestion, quiz: { ...stats.quiz, accuracy } };
  };

  readonly listQuizAnswers = async (
    userId: string,
    limit: number,
    cursor: QuizAnswerHistoryCursor | null,
  ): Promise<QuizAnswerHistoryPage> => {
    await this.assertUserCanRead(userId);
    return this.repository.listQuizAnswers(userId, limit, cursor);
  };

  private async assertUserCanRead(userId: string): Promise<void> {
    if (await this.repository.isUserDeleted(userId)) {
      throw new HistoryUserDeletedError();
    }
  }
}
