import { and, asc, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import type { AgeGroup, Gender } from "../../application/entity/concern";
import {
  Quiz,
  type QuizAnswerResult,
  type QuizCandidate,
  type QuizParticipant,
  type QuizStatus,
} from "../../application/entity/quiz";
import type {
  QuizRepository,
  RecordQuizAnswerInput,
  RecordQuizAnswerResult,
} from "../../application/repository/quiz.repository";
import {
  concerns,
  quizAnswers,
  quizAttempts,
  quizOptions,
  quizParticipants,
  quizzes,
} from "./schema";

/** クイズの永続化と、元投稿の公開状態を確認するD1 Adapter。 */
export class D1QuizRepository implements QuizRepository {
  private readonly db: ReturnType<typeof drizzle>;
  private readonly database: D1Database;

  constructor(database: D1Database) {
    this.database = database;
    this.db = drizzle(database);
  }

  async findPublishedByDate(
    quizDate: string,
    userId: string,
  ): Promise<Quiz | null> {
    const row = await this.db
      .select({ id: quizzes.id })
      .from(quizzes)
      .where(
        and(eq(quizzes.quizDate, quizDate), eq(quizzes.status, "published")),
      )
      .get();

    return row ? this.findAvailableById(row.id, userId) : null;
  }

  findPublishedById(quizId: string, userId: string): Promise<Quiz | null> {
    return this.findAvailableById(quizId, userId);
  }

  async listCandidates(): Promise<QuizCandidate[]> {
    const rows = await this.db
      .select({
        userId: concerns.userId,
        concernId: concerns.id,
        body: concerns.body,
        ageGroup: concerns.ageGroup,
        gender: concerns.genderCode,
        regionCode: concerns.regionCode,
      })
      .from(concerns)
      .where(eq(concerns.visibilityStatus, "published"))
      .orderBy(desc(concerns.createdAt), desc(concerns.id))
      .all();

    return rows.map((row) => ({
      userId: row.userId,
      concernId: row.concernId,
      body: row.body,
      ageGroup: row.ageGroup as AgeGroup | null,
      gender: row.gender as Gender | null,
      regionCode: row.regionCode,
    }));
  }

  async insert(quiz: Quiz): Promise<boolean> {
    const statements = [
      this.database
        .prepare(
          `INSERT INTO quizzes (id, quiz_date, status, created_at, published_at, hidden_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT (quiz_date) DO NOTHING`,
        )
        .bind(
          quiz.id,
          quiz.quizDate,
          quiz.status,
          quiz.createdAt,
          quiz.publishedAt,
          quiz.hiddenAt,
        ),
      ...quiz.participants.map((participant) =>
        this.database
          .prepare(
            `INSERT INTO quiz_participants
              (id, quiz_id, user_id, concern_id, display_order, age_group_snapshot, gender_snapshot, region_code_snapshot, explanation)
             SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
             WHERE EXISTS (
               SELECT 1 FROM quizzes WHERE id = ? AND quiz_date = ?
             )`,
          )
          .bind(
            participant.id,
            quiz.id,
            participant.userId,
            participant.concernId,
            participant.displayOrder,
            participant.ageGroup,
            participant.gender,
            participant.regionCode,
            participant.explanation,
            quiz.id,
            quiz.quizDate,
          ),
      ),
      ...quiz.options.map((option) =>
        this.database
          .prepare(
            `INSERT INTO quiz_options (quiz_id, concern_id, display_order)
             SELECT ?, ?, ?
             WHERE EXISTS (
               SELECT 1 FROM quizzes WHERE id = ? AND quiz_date = ?
             )`,
          )
          .bind(
            quiz.id,
            option.concernId,
            option.displayOrder,
            quiz.id,
            quiz.quizDate,
          ),
      ),
    ];
    await this.database.batch(statements);

    const inserted = await this.db
      .select({ id: quizzes.id })
      .from(quizzes)
      .where(eq(quizzes.id, quiz.id))
      .get();
    return Boolean(inserted);
  }

  async recordAnswer(
    input: RecordQuizAnswerInput,
  ): Promise<RecordQuizAnswerResult> {
    const statements = [
      this.database
        .prepare(
          `INSERT INTO quiz_attempts (id, quiz_id, user_id, score, answered_at)
           SELECT ?, ?, ?, ?, ?
           FROM quizzes
           WHERE quizzes.id = ?
             AND quizzes.status = 'published'
             AND (SELECT count(*) FROM quiz_participants WHERE quiz_id = ?) = 3
             AND NOT EXISTS (
               SELECT 1
               FROM quiz_participants
               INNER JOIN concerns ON concerns.id = quiz_participants.concern_id
               WHERE quiz_participants.quiz_id = ?
                 AND concerns.visibility_status <> 'published'
             )
           ON CONFLICT (quiz_id, user_id) DO NOTHING`,
        )
        .bind(
          input.attemptId,
          input.quizId,
          input.userId,
          input.score,
          input.answeredAt,
          input.quizId,
          input.quizId,
          input.quizId,
        ),
      ...input.answers.map((answer) =>
        this.database
          .prepare(
            `INSERT INTO quiz_answers
              (attempt_id, quiz_id, participant_id, selected_concern_id, is_correct)
             SELECT ?, ?, ?, ?, ?
             WHERE EXISTS (
               SELECT 1
               FROM quiz_attempts
               WHERE id = ? AND quiz_id = ? AND user_id = ?
             )`,
          )
          .bind(
            input.attemptId,
            input.quizId,
            answer.participantId,
            answer.concernId,
            answer.isCorrect ? 1 : 0,
            input.attemptId,
            input.quizId,
            input.userId,
          ),
      ),
    ];
    await this.database.batch(statements);

    const inserted = await this.db
      .select({ id: quizAttempts.id })
      .from(quizAttempts)
      .where(eq(quizAttempts.id, input.attemptId))
      .get();
    if (inserted) {
      return { status: "created" };
    }

    const existing = await this.db
      .select({ id: quizAttempts.id })
      .from(quizAttempts)
      .where(
        and(
          eq(quizAttempts.quizId, input.quizId),
          eq(quizAttempts.userId, input.userId),
        ),
      )
      .get();
    if (existing) {
      return { status: "already_answered" };
    }

    if (!(await this.isAvailable(input.quizId))) {
      await this.hide(input.quizId, input.answeredAt);
      return { status: "not_available" };
    }

    return { status: "not_available" };
  }

  private async isAvailable(quizId: string): Promise<boolean> {
    const quiz = await this.db
      .select({ status: quizzes.status })
      .from(quizzes)
      .where(eq(quizzes.id, quizId))
      .get();
    const sourceConcerns = await this.db
      .select({ visibilityStatus: concerns.visibilityStatus })
      .from(quizParticipants)
      .innerJoin(concerns, eq(quizParticipants.concernId, concerns.id))
      .where(eq(quizParticipants.quizId, quizId))
      .all();

    return Boolean(
      quiz?.status === "published" &&
        sourceConcerns.length === 3 &&
        sourceConcerns.every(
          (concern) => concern.visibilityStatus === "published",
        ),
    );
  }

  private async findAvailableById(
    quizId: string,
    userId: string,
  ): Promise<Quiz | null> {
    const quizRow = await this.db
      .select()
      .from(quizzes)
      .where(and(eq(quizzes.id, quizId), eq(quizzes.status, "published")))
      .get();
    if (!quizRow) {
      return null;
    }

    const participantRows = await this.db
      .select({
        id: quizParticipants.id,
        userId: quizParticipants.userId,
        concernId: quizParticipants.concernId,
        displayOrder: quizParticipants.displayOrder,
        ageGroup: quizParticipants.ageGroupSnapshot,
        gender: quizParticipants.genderSnapshot,
        regionCode: quizParticipants.regionCodeSnapshot,
        explanation: quizParticipants.explanation,
        visibilityStatus: concerns.visibilityStatus,
      })
      .from(quizParticipants)
      .innerJoin(concerns, eq(quizParticipants.concernId, concerns.id))
      .where(eq(quizParticipants.quizId, quizId))
      .orderBy(asc(quizParticipants.displayOrder))
      .all();
    const optionRows = await this.db
      .select({
        concernId: quizOptions.concernId,
        displayOrder: quizOptions.displayOrder,
        body: concerns.body,
        visibilityStatus: concerns.visibilityStatus,
      })
      .from(quizOptions)
      .innerJoin(concerns, eq(quizOptions.concernId, concerns.id))
      .where(eq(quizOptions.quizId, quizId))
      .orderBy(asc(quizOptions.displayOrder))
      .all();

    if (
      participantRows.length !== 3 ||
      optionRows.length !== 3 ||
      participantRows.some((row) => row.visibilityStatus !== "published") ||
      optionRows.some((row) => row.visibilityStatus !== "published")
    ) {
      await this.hide(quizId, new Date().toISOString());
      return null;
    }

    const participants: QuizParticipant[] = participantRows.map((row) => ({
      id: row.id,
      userId: row.userId,
      concernId: row.concernId,
      displayOrder: row.displayOrder,
      ageGroup: row.ageGroup as AgeGroup | null,
      gender: row.gender as Gender | null,
      regionCode: row.regionCode,
      explanation: row.explanation,
    }));
    const answerResult = await this.findAnswerResult(
      quizId,
      userId,
      participants,
    );

    return new Quiz({
      id: quizRow.id,
      quizDate: quizRow.quizDate,
      status: quizRow.status as QuizStatus,
      createdAt: quizRow.createdAt,
      publishedAt: quizRow.publishedAt,
      hiddenAt: quizRow.hiddenAt,
      participants,
      options: optionRows.map((row) => ({
        concernId: row.concernId,
        body: row.body,
        displayOrder: row.displayOrder,
      })),
      ...(answerResult ? { answerResult } : {}),
    });
  }

  private async findAnswerResult(
    quizId: string,
    userId: string,
    participants: readonly QuizParticipant[],
  ): Promise<QuizAnswerResult | null> {
    const attempt = await this.db
      .select()
      .from(quizAttempts)
      .where(
        and(eq(quizAttempts.quizId, quizId), eq(quizAttempts.userId, userId)),
      )
      .get();
    if (!attempt) {
      return null;
    }

    const answers = await this.db
      .select()
      .from(quizAnswers)
      .where(eq(quizAnswers.attemptId, attempt.id))
      .all();
    if (answers.length !== 3) {
      return null;
    }

    return {
      quizId,
      score: attempt.score,
      total: 3,
      results: participants.map((participant) => {
        const answer = answers.find(
          (item) => item.participantId === participant.id,
        );
        if (!answer) {
          throw new Error("quiz answer is incomplete");
        }
        return {
          participantId: participant.id,
          selectedConcernId: answer.selectedConcernId,
          correctConcernId: participant.concernId,
          correct: answer.isCorrect === 1,
          explanation: participant.explanation,
        };
      }),
      answeredAt: attempt.answeredAt,
    };
  }

  private async hide(quizId: string, hiddenAt: string): Promise<void> {
    await this.db
      .update(quizzes)
      .set({ status: "hidden", hiddenAt })
      .where(and(eq(quizzes.id, quizId), eq(quizzes.status, "published")))
      .run();
  }
}
