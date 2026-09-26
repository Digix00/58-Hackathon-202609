import type {
  ConcernProcessingStatus,
  ConcernTextRepresentation,
} from "../entity/concern";

export const CONCERN_LANGUAGES = ["original", "jaHira", "en"] as const;
export type ConcernLanguage = (typeof CONCERN_LANGUAGES)[number];

export type ConcernRepresentationState = "pending" | "ready" | "failed";

/**
 * APIの表示言語を決める。Query で明示された言語を優先し、未指定の場合は
 * ログインユーザーの表示形式、未ログインなら原文とする。
 */
export function resolveConcernLanguage(
  requested: ConcernLanguage | undefined,
  userDisplayLanguage: ConcernLanguage | undefined,
): ConcernLanguage {
  return requested ?? userDisplayLanguage ?? "original";
}

export interface SelectedConcernText {
  body: string;
  language: ConcernLanguage;
}

/** 表現行がない場合は投稿全体の処理状態から pending / failed を補う。 */
export function getConcernRepresentationState(
  representations: readonly ConcernTextRepresentation[],
  processingStatus: ConcernProcessingStatus,
  locale: ConcernTextRepresentation["locale"],
): ConcernRepresentationState {
  const representation = representations.find(
    (candidate) => candidate.locale === locale,
  );
  if (representation) {
    return representation.status;
  }

  return processingStatus === "failed" ? "failed" : "pending";
}

/** 指定表現が ready のときだけ採用し、それ以外は原文へ戻す。 */
export function selectConcernText(
  originalBody: string,
  representations: readonly ConcernTextRepresentation[],
  language: ConcernLanguage,
): SelectedConcernText {
  if (language === "original") {
    return { body: originalBody, language: "original" };
  }

  const locale = language === "jaHira" ? "ja-Hira" : "en";
  const representation = representations.find(
    (candidate) => candidate.locale === locale,
  );
  if (representation?.status === "ready") {
    return { body: representation.body, language };
  }

  return { body: originalBody, language: "original" };
}
