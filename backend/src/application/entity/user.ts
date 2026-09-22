import type { Gender } from "./user-profile";
import type { RegionCode } from "./region-code";

export interface User {
  id: string;
  lineUserId: string;
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
