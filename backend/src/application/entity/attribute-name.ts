import type { AgeGroup } from "./concern";
import type { DisplayLanguage, Gender } from "./user";

type AttributeNames = Record<DisplayLanguage, string>;

/** 年代・性別・都道府県で共通して使う「回答しない」の表示名。 */
export const NO_ANSWER_NAMES: AttributeNames = {
  original: "回答しない",
  jaHira: "こたえない",
  en: "Prefer not to say",
};

const GENDER_NAMES: Record<Gender, AttributeNames> = {
  male: { original: "男性", jaHira: "だんせい", en: "Male" },
  female: { original: "女性", jaHira: "じょせい", en: "Female" },
  non_binary: {
    original: "ノンバイナリー",
    jaHira: "のんばいなりー",
    en: "Non-binary",
  },
  other: { original: "その他", jaHira: "そのた", en: "Other" },
  no_answer: NO_ANSWER_NAMES,
};

const AGE_GROUP_NAMES: Record<AgeGroup, AttributeNames> = {
  "10s": { original: "10代", jaHira: "10だい", en: "Teens" },
  "20s": { original: "20代", jaHira: "20だい", en: "20s" },
  "30s": { original: "30代", jaHira: "30だい", en: "30s" },
  "40s": { original: "40代", jaHira: "40だい", en: "40s" },
  "50s": { original: "50代", jaHira: "50だい", en: "50s" },
  "60s": { original: "60代", jaHira: "60だい", en: "60s" },
  "70s": { original: "70代", jaHira: "70だい", en: "70s" },
  "80s": { original: "80代", jaHira: "80だい", en: "80s" },
  "90s_plus": {
    original: "90代以上",
    jaHira: "90だいいじょう",
    en: "90 and over",
  },
  no_answer: NO_ANSWER_NAMES,
};

/** 性別コードを表示形式に合わせた名称へ変換する。未知のコードはそのまま返す。 */
export function getGenderName(
  gender: string | null | undefined,
  displayLanguage: DisplayLanguage,
): string | undefined {
  if (!gender) {
    return undefined;
  }

  return GENDER_NAMES[gender as Gender]?.[displayLanguage] ?? gender;
}

/** 年代コードを表示形式に合わせた名称へ変換する。未知のコードはそのまま返す。 */
export function getAgeGroupName(
  ageGroup: string | null | undefined,
  displayLanguage: DisplayLanguage,
): string | undefined {
  if (!ageGroup) {
    return undefined;
  }

  return AGE_GROUP_NAMES[ageGroup as AgeGroup]?.[displayLanguage] ?? ageGroup;
}
