import { REGION_CODES } from "./region-code";

export const AGE_GROUPS = [
  "10s",
  "20s",
  "30s",
  "40s",
  "50s",
  "60s",
  "70s",
  "80s",
  "90s_plus",
  "no_answer",
] as const;
export type AgeGroup = (typeof AGE_GROUPS)[number];

export const GENDERS = [
  "male",
  "female",
  "non_binary",
  "other",
  "no_answer",
] as const;
export type Gender = (typeof GENDERS)[number];

export const CONCERN_INPUT_METHODS = ["liff", "voice"] as const;
export type ConcernInputMethod = (typeof CONCERN_INPUT_METHODS)[number];

export const CONCERN_VISIBILITY_STATUSES = [
  "pending",
  "published",
  "hidden",
  "deleted",
] as const;
export type ConcernVisibilityStatus =
  (typeof CONCERN_VISIBILITY_STATUSES)[number];

export const CONCERN_PROCESSING_STATUSES = [
  "pending",
  "processing",
  "ready",
  "failed",
] as const;
export type ConcernProcessingStatus =
  (typeof CONCERN_PROCESSING_STATUSES)[number];

export const CONCERN_BODY_MAX_LENGTH = 1000;

/** Concernの不変条件（本文長さ・属性値の妥当性）に違反した場合に投げるドメインエラー。 */
export class ConcernValidationError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = "ConcernValidationError";
    this.field = field;
  }
}

export interface ConcernProps {
  id: string;
  userId: string;
  body: string;
  inputMethod: ConcernInputMethod;
  ageGroup?: AgeGroup | null;
  gender?: Gender | null;
  regionCode?: string | null;
  visibilityStatus?: ConcernVisibilityStatus;
  processingStatus?: ConcernProcessingStatus;
  createdAt: string;
}

/**
 * 悩み投稿のドメインエンティティ。
 * コンストラクタで不変条件を検証し、違反時はConcernValidationErrorを投げる。
 * HTTPやD1の都合（リクエスト形式、永続化カラム名）を持ち込まない。
 */
export class Concern {
  readonly id: string;
  readonly userId: string;
  readonly body: string;
  readonly inputMethod: ConcernInputMethod;
  readonly ageGroup: AgeGroup | null;
  readonly gender: Gender | null;
  readonly regionCode: string | null;
  readonly visibilityStatus: ConcernVisibilityStatus;
  readonly processingStatus: ConcernProcessingStatus;
  readonly createdAt: string;

  constructor(props: ConcernProps) {
    const body = props.body.trim();
    if (body.length === 0 || body.length > CONCERN_BODY_MAX_LENGTH) {
      throw new ConcernValidationError(
        "body",
        `body must be a non-empty string of at most ${CONCERN_BODY_MAX_LENGTH} characters`,
      );
    }
    if (!CONCERN_INPUT_METHODS.includes(props.inputMethod)) {
      throw new ConcernValidationError(
        "inputMethod",
        "inputMethod must be one of liff, voice",
      );
    }
    if (props.ageGroup && !AGE_GROUPS.includes(props.ageGroup)) {
      throw new ConcernValidationError("ageGroup", "ageGroup is invalid");
    }
    if (props.gender && !GENDERS.includes(props.gender)) {
      throw new ConcernValidationError("gender", "gender is invalid");
    }
    if (
      props.regionCode &&
      !(REGION_CODES as readonly string[]).includes(props.regionCode)
    ) {
      throw new ConcernValidationError("regionCode", "regionCode is invalid");
    }

    this.id = props.id;
    this.userId = props.userId;
    this.body = body;
    this.inputMethod = props.inputMethod;
    this.ageGroup = props.ageGroup ?? null;
    this.gender = props.gender ?? null;
    this.regionCode = props.regionCode ?? null;
    this.visibilityStatus = props.visibilityStatus ?? "published";
    this.processingStatus = props.processingStatus ?? "pending";
    this.createdAt = props.createdAt;
  }
}
