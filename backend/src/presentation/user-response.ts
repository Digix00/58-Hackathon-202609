import { isUserProfileCompleted, type User } from "../application/entity/user";
import { getGenderName, getRegionName } from "../util/attribute-name";

/** ユーザー情報のレスポンス。性別・都道府県名は本人の表示形式で返す。 */
export function toUserResponse(user: User) {
  return {
    id: user.id,
    displayLanguage: user.displayLanguage,
    birthYear: user.birthYear,
    birthMonth: user.birthMonth,
    gender: user.gender,
    genderName: getGenderName(user.gender, user.displayLanguage) ?? null,
    regionCode: user.regionCode,
    regionName: getRegionName(user.regionCode, user.displayLanguage) ?? null,
    profileCompleted: isUserProfileCompleted(user),
  };
}
