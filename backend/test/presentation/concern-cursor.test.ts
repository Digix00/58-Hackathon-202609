import { describe, expect, it } from "vitest";

import { RECOMMENDATION_ALGORITHM_VERSION } from "../../src/application/recommendation/recommendation.policy";
import type { RecommendedConcernCursor } from "../../src/application/repository/concern.repository";
import {
  decodeConcernCursor,
  encodeConcernCursor,
} from "../../src/presentation/concern-cursor";

const context = {
  sort: "recommended" as const,
  regionCode: "tokyo",
  clusterId: "cluster-filter",
};

const recommendationCursor: RecommendedConcernCursor = {
  type: "recommended",
  sourceCursor: {
    createdAt: "2026-09-22T00:00:00.000Z",
    id: "source-cursor",
  },
  pendingConcernIds: ["pending-1", "pending-2"],
  lastClusterId: "cluster-last",
  candidateWindowCursor: {
    createdAt: "2026-09-20T00:00:00.000Z",
    id: "window-start",
  },
  returnedConcernIds: ["returned-1"],
};

describe("concern cursor", () => {
  it("preserves recommendation state and algorithm version", () => {
    const encoded = encodeConcernCursor(recommendationCursor, context);
    const decoded = decodeConcernCursor(encoded, context);

    expect(decoded).toEqual({
      cursor: recommendationCursor.sourceCursor,
      recommendationCursor,
    });
    expect(decodeCursorPayload(encoded)).toMatchObject({
      algorithmVersion: RECOMMENDATION_ALGORITHM_VERSION,
    });
  });

  it("rejects a recommendation cursor from another algorithm version", () => {
    const encoded = encodeConcernCursor(recommendationCursor, context);
    const payload = decodeCursorPayload(encoded);
    payload.algorithmVersion = "v0";

    expect(
      decodeConcernCursor(encodeCursorPayload(payload), context),
    ).toBeNull();
  });
});

function decodeCursorPayload(value: string): Record<string, unknown> {
  const base64 = value
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(value.length + ((4 - (value.length % 4)) % 4), "=");
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
}

function encodeCursorPayload(payload: Record<string, unknown>): string {
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
