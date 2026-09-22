import type { CreateConcernResponse } from "../../lib/api";

/**
 * backend/src/application/entity/concern.ts, region-code.ts と値を同期させること。
 */
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

export const REGION_CODES = [
  "hokkaido",
  "aomori",
  "iwate",
  "miyagi",
  "akita",
  "yamagata",
  "fukushima",
  "ibaraki",
  "tochigi",
  "gunma",
  "saitama",
  "chiba",
  "tokyo",
  "kanagawa",
  "niigata",
  "toyama",
  "ishikawa",
  "fukui",
  "yamanashi",
  "nagano",
  "gifu",
  "shizuoka",
  "aichi",
  "mie",
  "shiga",
  "kyoto",
  "osaka",
  "hyogo",
  "nara",
  "wakayama",
  "tottori",
  "shimane",
  "okayama",
  "hiroshima",
  "yamaguchi",
  "tokushima",
  "kagawa",
  "ehime",
  "kochi",
  "fukuoka",
  "saga",
  "nagasaki",
  "kumamoto",
  "oita",
  "miyazaki",
  "kagoshima",
  "okinawa",
] as const;
export type RegionCode = (typeof REGION_CODES)[number];

export const CONCERN_INPUT_METHODS = ["liff", "voice"] as const;
export type ConcernInputMethod = (typeof CONCERN_INPUT_METHODS)[number];

export const POST_BODY_MAX_LENGTH = 1000;

export interface PostFormInput {
  body: string;
  ageGroup?: AgeGroup;
  gender?: Gender;
  regionCode?: RegionCode;
  inputMethod: ConcernInputMethod;
}

export type PostFormFieldErrors = Partial<
  Record<"body" | "ageGroup" | "gender" | "regionCode" | "inputMethod", string>
>;

export type PostResult = CreateConcernResponse;

export function validatePostInput(input: PostFormInput): PostFormFieldErrors {
  const fieldErrors: PostFormFieldErrors = {};

  const trimmedBody = input.body.trim();
  if (trimmedBody.length === 0) {
    fieldErrors.body = "悩みの内容を入力してください";
  } else if (trimmedBody.length > POST_BODY_MAX_LENGTH) {
    fieldErrors.body = `本文は${POST_BODY_MAX_LENGTH}文字以内で入力してください`;
  }

  if (input.ageGroup && !AGE_GROUPS.includes(input.ageGroup)) {
    fieldErrors.ageGroup = "年代の選択が正しくありません";
  }
  if (input.gender && !GENDERS.includes(input.gender)) {
    fieldErrors.gender = "性別の選択が正しくありません";
  }
  if (input.regionCode && !REGION_CODES.includes(input.regionCode)) {
    fieldErrors.regionCode = "地域の選択が正しくありません";
  }
  if (!CONCERN_INPUT_METHODS.includes(input.inputMethod)) {
    fieldErrors.inputMethod = "入力方法が正しくありません";
  }

  return fieldErrors;
}
