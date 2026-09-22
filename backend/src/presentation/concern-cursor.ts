import type { ConcernListCursor } from "../application/repository/concern.repository";

const CURSOR_VERSION = 1;

interface EncodedConcernCursor extends ConcernListCursor {
  version: typeof CURSOR_VERSION;
}

export function encodeConcernCursor(cursor: ConcernListCursor): string {
  const payload: EncodedConcernCursor = {
    version: CURSOR_VERSION,
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

export function decodeConcernCursor(value: string): ConcernListCursor | null {
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

    if (!isEncodedConcernCursor(parsed)) {
      return null;
    }

    return {
      createdAt: parsed.createdAt,
      id: parsed.id,
    };
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
    typeof cursor.createdAt === "string" &&
    cursor.createdAt.length > 0 &&
    typeof cursor.id === "string" &&
    cursor.id.length > 0
  );
}
