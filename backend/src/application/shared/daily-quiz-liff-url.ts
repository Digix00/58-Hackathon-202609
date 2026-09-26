import { createLiffUrl } from "./liff-url";

/** LINE配信から当日クイズを開くLIFF URLを生成する。 */
export function createDailyQuizLiffUrl(
  liffId: string | undefined,
): string | null {
  return createLiffUrl(liffId, "/quiz/today");
}
