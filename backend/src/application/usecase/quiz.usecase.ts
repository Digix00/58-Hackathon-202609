import {
  hasDistinctQuizAttributes,
  Quiz,
  QuizAlreadyAnsweredError,
  type QuizAnswerMatch,
  type QuizAnswerResult,
  type QuizCandidate,
  QuizNotAvailableError,
  QuizValidationError,
} from "../entity/quiz";
import type {
  QuizRepository,
  RecordQuizAnswerInput,
} from "../repository/quiz.repository";
import { generateId } from "../shared/id-generator";

export interface AnswerQuizInput {
  quizId: string;
  userId: string;
  matches: QuizAnswerMatch[];
}

export interface IQuizUseCase {
  getToday(userId: string): Promise<Quiz | null>;
  getById(quizId: string, userId: string): Promise<Quiz | null>;
  generate(quizDate: string): Promise<Quiz | null>;
  answer(input: AnswerQuizInput): Promise<QuizAnswerResult>;
}

/** クイズの生成、表示、回答確定を扱うUseCase。 */
export class QuizUseCase implements IQuizUseCase {
  private readonly repository: QuizRepository;
  private readonly now: () => Date;
  private readonly createId: () => string;

  constructor(
    repository: QuizRepository,
    now: () => Date = () => new Date(),
    createId: () => string = generateId,
  ) {
    this.repository = repository;
    this.now = now;
    this.createId = createId;
  }

  readonly getToday = (userId: string): Promise<Quiz | null> =>
    this.repository.findPublishedByDate(toTokyoQuizDate(this.now()), userId);

  readonly getById = (quizId: string, userId: string): Promise<Quiz | null> =>
    this.repository.findPublishedById(quizId, userId);

  /**
   * 当日取得とは分離したクイズ生成処理。
   * 候補不足、属性重複、同日クイズの既存をいずれも生成なしとして扱う。
   */
  readonly generate = async (quizDate: string): Promise<Quiz | null> => {
    const candidates = await this.repository.listCandidates();
    const selected = selectCandidateTriplet(candidates);
    if (!selected) {
      return null;
    }

    const now = this.now().toISOString();
    const participants = selected.map((candidate, index) => ({
      id: this.createId(),
      userId: candidate.userId,
      concernId: candidate.concernId,
      ageGroup: candidate.ageGroup,
      gender: candidate.gender,
      regionCode: candidate.regionCode,
      displayOrder: index + 1,
      explanation: "属性と投稿内容の対応を確認できます",
    }));
    const options = selected.map((candidate, index) => ({
      concernId: candidate.concernId,
      body: candidate.body,
      displayOrder: index + 1,
    }));
    const quiz = new Quiz({
      id: this.createId(),
      quizDate,
      status: "published",
      createdAt: now,
      publishedAt: now,
      hiddenAt: null,
      participants,
      options,
    });

    return (await this.repository.insert(quiz)) ? quiz : null;
  };

  readonly answer = async (
    input: AnswerQuizInput,
  ): Promise<QuizAnswerResult> => {
    const quiz = await this.repository.findPublishedById(
      input.quizId,
      input.userId,
    );
    if (!quiz) {
      throw new QuizNotAvailableError();
    }
    if (quiz.answerResult) {
      throw new QuizAlreadyAnsweredError();
    }

    validateMatches(quiz, input.matches);

    const answeredAt = this.now().toISOString();
    const results = quiz.participants.map((participant) => {
      const match = input.matches.find(
        (item) => item.participantId === participant.id,
      );
      if (!match) {
        throw new QuizValidationError(
          "matches",
          "a match is required for every participant",
        );
      }

      return {
        participantId: participant.id,
        selectedConcernId: match.concernId,
        correctConcernId: participant.concernId,
        correct: participant.concernId === match.concernId,
        explanation: participant.explanation,
      };
    });
    const score = results.filter((result) => result.correct).length;
    const recordInput: RecordQuizAnswerInput = {
      quizId: quiz.id,
      userId: input.userId,
      attemptId: this.createId(),
      score,
      answeredAt,
      answers: results.map((result) => ({
        participantId: result.participantId,
        concernId: result.selectedConcernId,
        isCorrect: result.correct,
      })),
    };

    const recorded = await this.repository.recordAnswer(recordInput);
    if (recorded.status === "already_answered") {
      throw new QuizAlreadyAnsweredError();
    }
    if (recorded.status === "not_available") {
      throw new QuizNotAvailableError();
    }

    return {
      quizId: quiz.id,
      score,
      total: 3,
      results,
      answeredAt,
    };
  };
}

export function selectCandidateTriplet(
  candidates: readonly QuizCandidate[],
): [QuizCandidate, QuizCandidate, QuizCandidate] | null {
  for (
    let firstIndex = 0;
    firstIndex < candidates.length - 2;
    firstIndex += 1
  ) {
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < candidates.length - 1;
      secondIndex += 1
    ) {
      for (
        let thirdIndex = secondIndex + 1;
        thirdIndex < candidates.length;
        thirdIndex += 1
      ) {
        const triplet = [
          candidates[firstIndex],
          candidates[secondIndex],
          candidates[thirdIndex],
        ] as [QuizCandidate, QuizCandidate, QuizCandidate];
        const userIds = new Set(triplet.map((candidate) => candidate.userId));
        if (userIds.size !== 3 || !hasDistinctQuizAttributes(triplet)) {
          continue;
        }

        return triplet;
      }
    }
  }

  return null;
}

function validateMatches(
  quiz: Quiz,
  matches: readonly QuizAnswerMatch[],
): void {
  if (matches.length !== 3) {
    throw new QuizValidationError(
      "matches",
      "exactly three matches are required",
    );
  }

  const participantIds = new Set(quiz.participants.map((item) => item.id));
  const concernIds = new Set(quiz.options.map((item) => item.concernId));
  const selectedParticipantIds = new Set(
    matches.map((match) => match.participantId),
  );
  const selectedConcernIds = new Set(matches.map((match) => match.concernId));

  if (
    selectedParticipantIds.size !== 3 ||
    selectedConcernIds.size !== 3 ||
    [...selectedParticipantIds].some((id) => !participantIds.has(id)) ||
    [...selectedConcernIds].some((id) => !concernIds.has(id))
  ) {
    throw new QuizValidationError(
      "matches",
      "matches must contain each participant and concern exactly once",
    );
  }
}

function toTokyoQuizDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Tokyo",
    year: "numeric",
  }).formatToParts(date);
  const values = new Map(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}
