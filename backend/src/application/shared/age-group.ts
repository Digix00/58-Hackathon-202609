import type { AgeGroup } from "../entity/concern";

const AGE_GROUP_UPPER_BOUNDS: ReadonlyArray<{
  maxAge: number;
  group: AgeGroup;
}> = [
  { maxAge: 19, group: "10s" },
  { maxAge: 29, group: "20s" },
  { maxAge: 39, group: "30s" },
  { maxAge: 49, group: "40s" },
  { maxAge: 59, group: "50s" },
  { maxAge: 69, group: "60s" },
  { maxAge: 79, group: "70s" },
  { maxAge: 89, group: "80s" },
];

const MIN_SUPPORTED_AGE = 10;

/**
 * プロフィールの生年月から年代区分を求める。生年月が未登録、または
 * サービス対象外の年齢（10歳未満）の場合はnullを返し、呼び出し側に補完させない。
 */
export function deriveAgeGroup(
  birthYear: number | null,
  birthMonth: number | null,
  now: Date = new Date(),
): AgeGroup | null {
  if (birthYear === null || birthMonth === null) {
    return null;
  }

  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth() + 1;
  const hasHadBirthdayThisYear = currentMonth >= birthMonth;
  const age = currentYear - birthYear - (hasHadBirthdayThisYear ? 0 : 1);

  if (age < MIN_SUPPORTED_AGE) {
    return null;
  }

  const bound = AGE_GROUP_UPPER_BOUNDS.find((entry) => age <= entry.maxAge);
  return bound?.group ?? "90s_plus";
}
