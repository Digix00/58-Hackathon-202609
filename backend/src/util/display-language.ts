export const DISPLAY_LANGUAGES = ["original", "jaHira", "en"] as const;
export type DisplayLanguage = (typeof DISPLAY_LANGUAGES)[number];

/**
 * APIの表示言語を決める。Query で明示された言語を優先し、未指定の場合は
 * ログインユーザーの表示形式、未ログインなら原文とする。
 */
export function resolveDisplayLanguage(
  requested: DisplayLanguage | undefined,
  userDisplayLanguage: DisplayLanguage | undefined,
): DisplayLanguage {
  return requested ?? userDisplayLanguage ?? "original";
}
