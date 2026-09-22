import {
  isUserProfileCompleted,
  type User,
} from "../application/entity/user";

export function toUserResponse(user: User) {
  return {
    id: user.id,
    birthYear: user.birthYear,
    birthMonth: user.birthMonth,
    gender: user.gender,
    regionCode: user.regionCode,
    profileCompleted: isUserProfileCompleted(user),
  };
}
