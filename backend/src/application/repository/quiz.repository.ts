import type { LearningEvent } from "../entity/learning-event";
import type { Quiz, QuizAnswerMatch, QuizCandidate } from "../entity/quiz";

export interface RecordQuizAnswerInput {
  quizId: string;
  userId: string;
  attemptId: string;
  score: number;
  answeredAt: string;
  answers: Array<
    QuizAnswerMatch & {
      isCorrect: boolean;
    }
  >;
}

export type RecordQuizAnswerStatus =
  | "created"
  | "already_answered"
  | "not_available";

export interface RecordQuizAnswerResult {
  status: RecordQuizAnswerStatus;
}

/** クイズ機能が必要とする永続化処理のPort。D1/Drizzleの詳細を含めない。 */
export interface QuizRepository {
  findPublishedByDate(quizDate: string, userId: string): Promise<Quiz | null>;
  findPublishedById(quizId: string, userId: string): Promise<Quiz | null>;
  listCandidates(): Promise<QuizCandidate[]>;
  insert(quiz: Quiz): Promise<boolean>;
  recordAnswer(
    input: RecordQuizAnswerInput,
    event: LearningEvent,
  ): Promise<RecordQuizAnswerResult>;
}
