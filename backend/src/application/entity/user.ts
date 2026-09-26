import { REGION_CODES, type RegionCode } from "./region-code";

export const GENDERS = [
  "male",
  "female",
  "non_binary",
  "other",
  "no_answer",
] as const;
export type Gender = (typeof GENDERS)[number];

import {
  DISPLAY_LANGUAGES,
  type DisplayLanguage,
} from "../../util/display-language";

export { DISPLAY_LANGUAGES, type DisplayLanguage };

export class DisplayLanguageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DisplayLanguageValidationError";
  }
}

export function validateDisplayLanguage(value: string): DisplayLanguage {
  if (!DISPLAY_LANGUAGES.includes(value as DisplayLanguage)) {
    throw new DisplayLanguageValidationError("displayLanguage is invalid");
  }

  return value as DisplayLanguage;
}

export interface UserProfile {
  birthYear: number;
  birthMonth: number;
  gender: Gender;
  regionCode: RegionCode;
}

export interface UserProfileInput {
  birthYear: number;
  birthMonth: number;
  gender: string;
  regionCode: string;
}

export class UserProfileValidationError extends Error {
  readonly field: keyof UserProfileInput;

  constructor(field: keyof UserProfileInput, message: string) {
    super(message);
    this.name = "UserProfileValidationError";
    this.field = field;
  }
}

/**
 * プロフィールの入力値を検証し、アプリケーションで扱う値へ変換する。
 * 生年月は年・月まで保持し、未来の年月は受け付けない。
 */
export function validateUserProfile(
  input: UserProfileInput,
  now: Date = new Date(),
): UserProfile {
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth() + 1;

  if (
    !Number.isInteger(input.birthYear) ||
    input.birthYear < 1900 ||
    input.birthYear > currentYear
  ) {
    throw new UserProfileValidationError(
      "birthYear",
      "birthYear must be between 1900 and the current year",
    );
  }

  if (
    !Number.isInteger(input.birthMonth) ||
    input.birthMonth < 1 ||
    input.birthMonth > 12
  ) {
    throw new UserProfileValidationError(
      "birthMonth",
      "birthMonth must be between 1 and 12",
    );
  }

  if (input.birthYear === currentYear && input.birthMonth > currentMonth) {
    throw new UserProfileValidationError(
      "birthMonth",
      "birthMonth must not be in the future",
    );
  }

  if (!GENDERS.includes(input.gender as Gender)) {
    throw new UserProfileValidationError("gender", "gender is invalid");
  }

  if (!REGION_CODES.includes(input.regionCode as RegionCode)) {
    throw new UserProfileValidationError("regionCode", "regionCode is invalid");
  }

  return {
    birthYear: input.birthYear,
    birthMonth: input.birthMonth,
    gender: input.gender as Gender,
    regionCode: input.regionCode as RegionCode,
  };
}

export interface User {
  id: string;
  lineUserId: string;
  displayLanguage: DisplayLanguage;
  birthYear: number | null;
  birthMonth: number | null;
  gender: Gender | null;
  regionCode: RegionCode | null;
}

export function isUserProfileCompleted(user: User): boolean {
  return (
    user.birthYear !== null &&
    user.birthMonth !== null &&
    user.gender !== null &&
    user.regionCode !== null
  );
}
