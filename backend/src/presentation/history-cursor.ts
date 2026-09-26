import type { QuizAnswerHistoryCursor } from "../application/entity/history";

const CURSOR_VERSION = 1;
const MAX_CURSOR_LENGTH = 512;
const MAX_QUIZ_ID_LENGTH = 200;

interface EncodedHistoryCursor extends QuizAnswerHistoryCursor {
  version: typeof CURSOR_VERSION;
}

export function encodeHistoryCursor(cursor: QuizAnswerHistoryCursor): string {
  const bytes = new TextEncoder().encode(
    JSON.stringify({ version: CURSOR_VERSION, ...cursor }),
  );
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

export function decodeHistoryCursor(
  value: string,
): QuizAnswerHistoryCursor | null {
  if (!value || value.length > MAX_CURSOR_LENGTH) return null;

  try {
    const base64 = value
      .replaceAll("-", "+")
      .replaceAll("_", "/")
      .padEnd(value.length + ((4 - (value.length % 4)) % 4), "=");
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (character) =>
      character.charCodeAt(0),
    );
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!isEncodedHistoryCursor(parsed)) return null;
    return { answeredAt: parsed.answeredAt, quizId: parsed.quizId };
  } catch {
    return null;
  }
}

function isEncodedHistoryCursor(value: unknown): value is EncodedHistoryCursor {
  if (typeof value !== "object" || value === null) return false;
  const cursor = value as Record<string, unknown>;
  return (
    cursor.version === CURSOR_VERSION &&
    typeof cursor.answeredAt === "string" &&
    Number.isFinite(Date.parse(cursor.answeredAt)) &&
    typeof cursor.quizId === "string" &&
    cursor.quizId.length > 0 &&
    cursor.quizId.length <= MAX_QUIZ_ID_LENGTH
  );
}
