import type { ConcernSort } from "../application/entity/feed";
import type { ConcernListCursor } from "../application/repository/concern.repository";

const LEGACY_CURSOR_VERSION = 1;
const CURSOR_VERSION = 2;

export interface ConcernCursorContext {
  sort: ConcernSort;
  regionCode?: string;
  clusterId?: string;
}

interface EncodedLegacyConcernCursor extends ConcernListCursor {
  version: typeof LEGACY_CURSOR_VERSION;
}

interface EncodedConcernCursor extends ConcernListCursor {
  version: typeof CURSOR_VERSION;
  sort: ConcernSort;
  regionCode: string | null;
  clusterId: string | null;
}

/**
 * GET /api/v1/concerns のレスポンスに含める nextCursor を生成する。
 * 次ページの開始位置と取得条件をJSON化し、クライアントが内容を解釈せず
 * そのまま送信できるBase64URL形式のopaque stringへ変換する。
 */
export function encodeConcernCursor(
  cursor: ConcernListCursor,
  context?: ConcernCursorContext,
): string {
  const payload: EncodedConcernCursor | EncodedLegacyConcernCursor = context
    ? {
        version: CURSOR_VERSION,
        ...cursor,
        sort: context.sort,
        regionCode: context.regionCode ?? null,
        clusterId: context.clusterId ?? null,
      }
    : {
        version: LEGACY_CURSOR_VERSION,
        ...cursor,
      };
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

/**
 * GET /api/v1/concerns の query parameter で受け取った cursor を復元する。
 * Base64URL、JSON、バージョン、取得条件、createdAt、idのいずれかが不正な場合は
 * nullを返し、HandlerがINVALID_CURSORとして400レスポンスへ変換する。
 */
export function decodeConcernCursor(
  value: string,
  expectedContext?: ConcernCursorContext,
): ConcernListCursor | null {
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

    if (isEncodedConcernCursor(parsed)) {
      if (
        expectedContext &&
        (parsed.sort !== expectedContext.sort ||
          parsed.regionCode !== (expectedContext.regionCode ?? null) ||
          parsed.clusterId !== (expectedContext.clusterId ?? null))
      ) {
        return null;
      }
      return { createdAt: parsed.createdAt, id: parsed.id };
    }

    return isEncodedLegacyConcernCursor(parsed)
      ? { createdAt: parsed.createdAt, id: parsed.id }
      : null;
  } catch {
    return null;
  }
}

function isEncodedConcernCursor(value: unknown): value is EncodedConcernCursor {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const cursor = value as Record<string, unknown>;
  return (
    cursor.version === CURSOR_VERSION &&
    (cursor.sort === "newest" || cursor.sort === "recommended") &&
    (cursor.regionCode === null || typeof cursor.regionCode === "string") &&
    (cursor.clusterId === null || typeof cursor.clusterId === "string") &&
    typeof cursor.createdAt === "string" &&
    cursor.createdAt.length > 0 &&
    typeof cursor.id === "string" &&
    cursor.id.length > 0
  );
}

function isEncodedLegacyConcernCursor(
  value: unknown,
): value is EncodedLegacyConcernCursor {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const cursor = value as Record<string, unknown>;
  return (
    cursor.version === LEGACY_CURSOR_VERSION &&
    typeof cursor.createdAt === "string" &&
    cursor.createdAt.length > 0 &&
    typeof cursor.id === "string" &&
    cursor.id.length > 0
  );
}
