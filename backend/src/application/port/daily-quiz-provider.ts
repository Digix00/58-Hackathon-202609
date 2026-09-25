export interface DailyQuizProvider {
  ensureDailyQuiz(
    quizDate: string,
  ): Promise<{ id: string; quizDate: string } | null>;
}
