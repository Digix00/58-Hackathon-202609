export const AGE_GROUPS = [
  "10s",
  "20s",
  "30s",
  "40s",
  "50s_plus",
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

/** 悩み投稿の業務語彙。HTTPやD1の都合を持ち込まない。 */
export interface Concern {
  id: string;
  userId: string;
  body: string;
  inputMethod: ConcernInputMethod;
  ageGroup: AgeGroup | null;
  gender: Gender | null;
  regionCode: string | null;
  visibilityStatus: ConcernVisibilityStatus;
  processingStatus: ConcernProcessingStatus;
  createdAt: string;
}
