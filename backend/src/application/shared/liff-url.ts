const LIFF_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/** LINE から LINEミニアプリの画面を開く LIFF URL を生成する。path は `/` から始める。 */
export function createLiffUrl(
  liffId: string | undefined,
  path: `/${string}`,
): string | null {
  const normalizedLiffId = liffId?.trim();
  if (!normalizedLiffId || !LIFF_ID_PATTERN.test(normalizedLiffId)) {
    return null;
  }

  return `https://liff.line.me/${normalizedLiffId}${path}`;
}
