import type {
  HistoryConcernCursor,
  QuizAnswerHistoryCursor,
} from "../application/entity/history";

const CURSOR_VERSION = 1;
const MAX_CURSOR_LENGTH = 512;
const MAX_QUIZ_ID_LENGTH = 200;
const MAX_CONCERN_ID_LENGTH = 200;

interface EncodedHistoryCursor extends QuizAnswerHistoryCursor {
  version: typeof CURSOR_VERSION;
}

export function encodeHistoryCursor(cursor: QuizAnswerHistoryCursor): string {
  return encodeCursor({ version: CURSOR_VERSION, ...cursor });
}

export function decodeHistoryCursor(
  value: string,
): QuizAnswerHistoryCursor | null {
  const parsed = decodeCursor(value);
  if (!isEncodedHistoryCursor(parsed)) return null;
  return { answeredAt: parsed.answeredAt, quizId: parsed.quizId };
}

function encodeCursor(payload: object): string {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function decodeCursor(value: string): unknown {
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
    return JSON.parse(new TextDecoder().decode(bytes));
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

interface EncodedHistoryConcernCursor extends HistoryConcernCursor {
  version: typeof CURSOR_VERSION;
}

/** 投稿・寄りそいの一覧は、並び順の基準日時と投稿IDで続きの位置を表す。 */
export function encodeHistoryConcernCursor(
  cursor: HistoryConcernCursor,
): string {
  return encodeCursor({ version: CURSOR_VERSION, ...cursor });
}

export function decodeHistoryConcernCursor(
  value: string,
): HistoryConcernCursor | null {
  const parsed = decodeCursor(value);
  if (!isEncodedHistoryConcernCursor(parsed)) return null;
  return { sortedAt: parsed.sortedAt, concernId: parsed.concernId };
}

function isEncodedHistoryConcernCursor(
  value: unknown,
): value is EncodedHistoryConcernCursor {
  if (typeof value !== "object" || value === null) return false;
  const cursor = value as Record<string, unknown>;
  return (
    cursor.version === CURSOR_VERSION &&
    typeof cursor.sortedAt === "string" &&
    Number.isFinite(Date.parse(cursor.sortedAt)) &&
    typeof cursor.concernId === "string" &&
    cursor.concernId.length > 0 &&
    cursor.concernId.length <= MAX_CONCERN_ID_LENGTH
  );
}
