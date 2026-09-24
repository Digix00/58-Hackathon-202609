import type { AgeGroup, Gender } from "./concern";

export const QUIZ_STATUSES = [
  "draft",
  "published",
  "closed",
  "hidden",
] as const;
export type QuizStatus = (typeof QUIZ_STATUSES)[number];

export interface QuizAttributes {
  ageGroup: AgeGroup | null;
  gender: Gender | null;
  regionCode: string | null;
}

export interface QuizCandidate extends QuizAttributes {
  userId: string;
  concernId: string;
  body: string;
}

export interface QuizParticipant extends QuizAttributes {
  id: string;
  userId: string;
  concernId: string;
  displayOrder: number;
  explanation: string;
}

export interface QuizOption {
  concernId: string;
  body: string;
  displayOrder: number;
}

export interface QuizAnswerMatch {
  participantId: string;
  concernId: string;
}

export interface QuizAnswerResultItem {
  participantId: string;
  selectedConcernId: string;
  correctConcernId: string;
  correct: boolean;
  explanation: string;
}

export interface QuizAnswerResult {
  quizId: string;
  score: number;
  total: 3;
  results: QuizAnswerResultItem[];
  answeredAt: string;
}

export interface QuizProps {
  id: string;
  quizDate: string;
  status: QuizStatus;
  createdAt: string;
  publishedAt: string | null;
  hiddenAt: string | null;
  participants: QuizParticipant[];
  options: QuizOption[];
  answerResult?: QuizAnswerResult;
}

export class QuizValidationError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = "QuizValidationError";
    this.field = field;
  }
}

export class QuizAlreadyAnsweredError extends Error {
  constructor() {
    super("quiz has already been answered by this user");
    this.name = "QuizAlreadyAnsweredError";
  }
}

export class QuizNotAvailableError extends Error {
  constructor() {
    super("quiz is not available");
    this.name = "QuizNotAvailableError";
  }
}

export class Quiz {
  readonly id: string;
  readonly quizDate: string;
  readonly status: QuizStatus;
  readonly createdAt: string;
  readonly publishedAt: string | null;
  readonly hiddenAt: string | null;
  readonly participants: readonly QuizParticipant[];
  readonly options: readonly QuizOption[];
  readonly answerResult: QuizAnswerResult | undefined;

  constructor(props: QuizProps) {
    if (props.participants.length !== 3) {
      throw new QuizValidationError(
        "participants",
        "a quiz must contain exactly three participants",
      );
    }
    if (props.options.length !== 3) {
      throw new QuizValidationError(
        "options",
        "a quiz must contain exactly three options",
      );
    }

    const participantIds = new Set(
      props.participants.map((participant) => participant.id),
    );
    const userIds = new Set(
      props.participants.map((participant) => participant.userId),
    );
    const participantConcernIds = new Set(
      props.participants.map((participant) => participant.concernId),
    );
    const optionConcernIds = new Set(
      props.options.map((option) => option.concernId),
    );

    if (participantIds.size !== 3 || userIds.size !== 3) {
      throw new QuizValidationError(
        "participants",
        "quiz participants must be unique",
      );
    }
    if (
      participantConcernIds.size !== 3 ||
      optionConcernIds.size !== 3 ||
      [...participantConcernIds].some(
        (concernId) => !optionConcernIds.has(concernId),
      )
    ) {
      throw new QuizValidationError(
        "options",
        "quiz options must match participant concerns",
      );
    }

    this.id = props.id;
    this.quizDate = props.quizDate;
    this.status = props.status;
    this.createdAt = props.createdAt;
    this.publishedAt = props.publishedAt;
    this.hiddenAt = props.hiddenAt;
    this.participants = props.participants;
    this.options = props.options;
    this.answerResult = props.answerResult;
  }
}

/**
 * クイズの属性は、未回答もヒントの一つとして扱う。
 * 3件の投稿間で年代・性別・都道府県のいずれも重複しないことを確認する。
 */
export function hasDistinctQuizAttributes(
  candidates: readonly QuizAttributes[],
): boolean {
  if (candidates.length !== 3) {
    return false;
  }

  return (
    new Set(candidates.map((candidate) => candidate.ageGroup ?? "no_answer"))
      .size === 3 &&
    new Set(candidates.map((candidate) => candidate.gender ?? "no_answer"))
      .size === 3 &&
    new Set(candidates.map((candidate) => candidate.regionCode ?? "no_answer"))
      .size === 3
  );
}
