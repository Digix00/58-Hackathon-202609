import {
  isUserProfileComplete,
  type User,
} from "../application/entity/user";

export function toUserResponse(user: User) {
  return {
    id: user.id,
    profile: {
      birthYear: user.birthYear,
      gender: user.gender,
      regionCode: user.regionCode,
    },
    profileCompleted: isUserProfileComplete(user),
  };
}
