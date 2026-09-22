import { REGION_CODES, type RegionCode } from "./region-code";

export const USER_GENDERS = [
  "male",
  "female",
  "non_binary",
  "other",
  "no_answer",
] as const;
export type UserGender = (typeof USER_GENDERS)[number];

export const USER_BIRTH_YEAR_MIN = 1900;

const USER_AGE_GROUPS = [
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
export type UserAgeGroup = (typeof USER_AGE_GROUPS)[number];

export interface User {
  id: string;
  lineUserId: string;
  birthYear: number | null;
  gender: UserGender | null;
  regionCode: RegionCode | null;
}

/**
 * ユーザープロフィールの更新入力。
 * undefinedは変更しない、nullは既存値を消去することを表す。
 * HTTP由来の値はUseCaseでvalidateUserProfilePatchを通してから利用する。
 */
export interface UserProfilePatch {
  birthYear?: number | null;
  gender?: string | null;
  regionCode?: string | null;
}

export interface ValidatedUserProfilePatch {
  birthYear?: number | null;
  gender?: UserGender | null;
  regionCode?: RegionCode | null;
}

export class UserProfileValidationError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = "UserProfileValidationError";
    this.field = field;
  }
}

export function validateUserProfilePatch(
  input: UserProfilePatch,
): ValidatedUserProfilePatch {
  if (
    input.birthYear !== undefined &&
    input.birthYear !== null &&
    (!Number.isInteger(input.birthYear) ||
      input.birthYear < USER_BIRTH_YEAR_MIN ||
      input.birthYear > new Date().getUTCFullYear())
  ) {
    throw new UserProfileValidationError(
      "birthYear",
      `birthYear must be between ${USER_BIRTH_YEAR_MIN} and the current year`,
    );
  }

  if (
    input.gender !== undefined &&
    input.gender !== null &&
    !USER_GENDERS.includes(input.gender as UserGender)
  ) {
    throw new UserProfileValidationError("gender", "gender is invalid");
  }

  if (
    input.regionCode !== undefined &&
    input.regionCode !== null &&
    !(REGION_CODES as readonly string[]).includes(input.regionCode)
  ) {
    throw new UserProfileValidationError(
      "regionCode",
      "regionCode is invalid",
    );
  }

  const validated: ValidatedUserProfilePatch = {};
  if ("birthYear" in input) {
    validated.birthYear = input.birthYear;
  }
  if ("gender" in input) {
    validated.gender = input.gender as UserGender | null | undefined;
  }
  if ("regionCode" in input) {
    validated.regionCode = input.regionCode as RegionCode | null | undefined;
  }

  return validated;
}

export function isUserProfileComplete(user: User): boolean {
  return (
    user.birthYear !== null &&
    user.gender !== null &&
    user.regionCode !== null
  );
}

/** 生年だけを保持するプロフィールから、投稿で使う年代コードを算出する。 */
export function ageGroupFromBirthYear(
  birthYear: number,
  now: Date = new Date(),
): UserAgeGroup {
  const age = now.getUTCFullYear() - birthYear;
  if (age < 10) {
    return "no_answer";
  }
  if (age >= 90) {
    return "90s_plus";
  }

  return `${Math.floor(age / 10) * 10}s` as Exclude<
    UserAgeGroup,
    "90s_plus" | "no_answer"
  >;
}
