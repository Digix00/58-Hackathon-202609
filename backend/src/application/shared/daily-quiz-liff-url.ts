const LIFF_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/** LINE配信から当日クイズを開くLIFF URLを生成する。 */
export function createDailyQuizLiffUrl(
  liffId: string | undefined,
): string | null {
  const normalizedLiffId = liffId?.trim();
  if (!normalizedLiffId || !LIFF_ID_PATTERN.test(normalizedLiffId)) {
    return null;
  }

  return `https://liff.line.me/${normalizedLiffId}/quiz/today`;
}
