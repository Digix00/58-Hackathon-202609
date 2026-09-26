import type { DisplayLanguage } from "./display-language";

/** 翻訳キューが生成した悩み本文の表現（`concern_representations` の行）。 */
export interface ConcernTextRepresentationLike {
  locale: "ja-Hira" | "en";
  body: string;
  status: "ready" | "failed";
}

export type ConcernRepresentationState = "pending" | "ready" | "failed";

export interface SelectedConcernText {
  body: string;
  language: DisplayLanguage;
}

/** 表現行がない場合は投稿全体の処理状態から pending / failed を補う。 */
export function getConcernRepresentationState(
  representations: readonly ConcernTextRepresentationLike[],
  processingStatus: string,
  locale: ConcernTextRepresentationLike["locale"],
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
  representations: readonly ConcernTextRepresentationLike[],
  language: DisplayLanguage,
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
