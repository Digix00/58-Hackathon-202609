import { GENDERS, type Gender } from "../application/entity/concern";
import type { ConcernSort } from "../application/entity/feed";
import { RECOMMENDATION_ALGORITHM_VERSION } from "../application/recommendation/recommendation.policy";
import type {
  ConcernFeedCursor,
  ConcernListCursor,
  RecommendedConcernCursor,
} from "../application/repository/concern.repository";

const LEGACY_CURSOR_VERSION = 1;
const CURSOR_VERSION = 3;
const RECOMMENDED_CURSOR_VERSION = 6;
const MAX_PENDING_CONCERN_IDS = 300;
const MAX_RETURNED_CONCERN_IDS = 300;
const MAX_CURSOR_ID_LENGTH = 200;

export interface ConcernCursorContext {
  sort: ConcernSort;
  regionCode?: string;
  clusterId?: string;
  gender?: Gender;
}

interface EncodedLegacyConcernCursor extends ConcernListCursor {
  version: typeof LEGACY_CURSOR_VERSION;
}

interface EncodedConcernCursor extends ConcernListCursor {
  version: typeof CURSOR_VERSION;
  sort: ConcernSort;
  regionCode: string | null;
  clusterId: string | null;
  gender: Gender | null;
}

interface EncodedRecommendedConcernCursor extends RecommendedConcernCursor {
  version: typeof RECOMMENDED_CURSOR_VERSION;
  algorithmVersion: typeof RECOMMENDATION_ALGORITHM_VERSION;
  sort: "recommended";
  regionCode: string | null;
  clusterId: string | null;
  gender: Gender | null;
}

export interface DecodedConcernCursor {
  cursor?: ConcernListCursor;
  recommendationCursor?: RecommendedConcernCursor;
}

/**
 * GET /api/v1/concerns のレスポンスに含める nextCursor を生成する。
 * 次ページの開始位置と取得条件をJSON化し、クライアントが内容を解釈せず
 * そのまま送信できるBase64URL形式のopaque stringへ変換する。
 */
export function encodeConcernCursor(
  cursor: ConcernFeedCursor,
  context?: ConcernCursorContext,
): string {
  const payload:
    | EncodedConcernCursor
    | EncodedRecommendedConcernCursor
    | EncodedLegacyConcernCursor = isRecommendedConcernCursor(cursor)
    ? {
        version: RECOMMENDED_CURSOR_VERSION,
        algorithmVersion: RECOMMENDATION_ALGORITHM_VERSION,
        ...cursor,
        sort: "recommended",
        regionCode: context?.regionCode ?? null,
        clusterId: context?.clusterId ?? null,
        gender: context?.gender ?? null,
      }
    : context?.sort === "recommended"
      ? {
          version: RECOMMENDED_CURSOR_VERSION,
          algorithmVersion: RECOMMENDATION_ALGORITHM_VERSION,
          type: "recommended" as const,
          sourceCursor: cursor,
          pendingConcernIds: [],
          lastClusterId: null,
          candidateWindowCursor: cursor,
          returnedConcernIds: [],
          sort: "recommended" as const,
          regionCode: context.regionCode ?? null,
          clusterId: context.clusterId ?? null,
          gender: context.gender ?? null,
        }
      : context
        ? {
            version: CURSOR_VERSION,
            ...cursor,
            sort: context.sort,
            regionCode: context.regionCode ?? null,
            clusterId: context.clusterId ?? null,
            gender: context.gender ?? null,
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
): DecodedConcernCursor | null {
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

    if (isEncodedRecommendedConcernCursor(parsed)) {
      if (!matchesContext(parsed, expectedContext)) {
        return null;
      }
      return {
        cursor: parsed.sourceCursor ?? undefined,
        recommendationCursor: {
          type: "recommended",
          sourceCursor: parsed.sourceCursor,
          pendingConcernIds: parsed.pendingConcernIds,
          lastClusterId: parsed.lastClusterId,
          candidateWindowCursor: parsed.candidateWindowCursor,
          returnedConcernIds: parsed.returnedConcernIds,
        },
      };
    }

    if (isEncodedConcernCursor(parsed)) {
      if (parsed.sort === "recommended") {
        return null;
      }
      if (!matchesContext(parsed, expectedContext)) {
        return null;
      }
      return { cursor: { createdAt: parsed.createdAt, id: parsed.id } };
    }

    if (isEncodedLegacyConcernCursor(parsed)) {
      if (expectedContext?.sort === "recommended") {
        return null;
      }
      return { cursor: { createdAt: parsed.createdAt, id: parsed.id } };
    }
    return null;
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
    (cursor.gender === null || GENDERS.includes(cursor.gender as Gender)) &&
    isConcernListCursor(cursor)
  );
}

function isEncodedRecommendedConcernCursor(
  value: unknown,
): value is EncodedRecommendedConcernCursor {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const cursor = value as Record<string, unknown>;
  const sourceCursor = cursor.sourceCursor;
  const pendingConcernIds = cursor.pendingConcernIds;
  return (
    cursor.version === RECOMMENDED_CURSOR_VERSION &&
    cursor.algorithmVersion === RECOMMENDATION_ALGORITHM_VERSION &&
    cursor.type === "recommended" &&
    cursor.sort === "recommended" &&
    (cursor.regionCode === null || typeof cursor.regionCode === "string") &&
    (cursor.clusterId === null || typeof cursor.clusterId === "string") &&
    (cursor.gender === null || GENDERS.includes(cursor.gender as Gender)) &&
    (cursor.lastClusterId === null ||
      (typeof cursor.lastClusterId === "string" &&
        cursor.lastClusterId.length > 0 &&
        cursor.lastClusterId.length <= MAX_CURSOR_ID_LENGTH)) &&
    (cursor.candidateWindowCursor === null ||
      isConcernListCursor(cursor.candidateWindowCursor)) &&
    (sourceCursor === null || isConcernListCursor(sourceCursor)) &&
    Array.isArray(pendingConcernIds) &&
    pendingConcernIds.length <= MAX_PENDING_CONCERN_IDS &&
    new Set(pendingConcernIds).size === pendingConcernIds.length &&
    pendingConcernIds.every(
      (id) =>
        typeof id === "string" &&
        id.length > 0 &&
        id.length <= MAX_CURSOR_ID_LENGTH,
    ) &&
    Array.isArray(cursor.returnedConcernIds) &&
    cursor.returnedConcernIds.length <= MAX_RETURNED_CONCERN_IDS &&
    new Set(cursor.returnedConcernIds).size ===
      cursor.returnedConcernIds.length &&
    cursor.returnedConcernIds.every(
      (id) =>
        typeof id === "string" &&
        id.length > 0 &&
        id.length <= MAX_CURSOR_ID_LENGTH,
    )
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
    cursor.version === LEGACY_CURSOR_VERSION && isConcernListCursor(cursor)
  );
}

function isRecommendedConcernCursor(
  cursor: ConcernFeedCursor,
): cursor is RecommendedConcernCursor {
  return "type" in cursor && cursor.type === "recommended";
}

function isConcernListCursor(value: unknown): value is ConcernListCursor {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const cursor = value as Record<string, unknown>;
  return (
    typeof cursor.createdAt === "string" &&
    cursor.createdAt.length > 0 &&
    typeof cursor.id === "string" &&
    cursor.id.length > 0 &&
    cursor.id.length <= MAX_CURSOR_ID_LENGTH
  );
}

function matchesContext(
  cursor: {
    sort: ConcernSort;
    regionCode: string | null;
    clusterId: string | null;
    gender: Gender | null;
  },
  expectedContext?: ConcernCursorContext,
): boolean {
  return (
    !expectedContext ||
    (cursor.sort === expectedContext.sort &&
      cursor.regionCode === (expectedContext.regionCode ?? null) &&
      cursor.clusterId === (expectedContext.clusterId ?? null) &&
      cursor.gender === (expectedContext.gender ?? null))
  );
}
