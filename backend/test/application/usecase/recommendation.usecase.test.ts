import { describe, expect, it } from "vitest";

import { Concern } from "../../../src/application/entity/concern";
import { ConcernCluster } from "../../../src/application/entity/concern-cluster";
import type { ConcernRepository } from "../../../src/application/repository/concern.repository";
import { ConcernUseCase } from "../../../src/application/usecase/concern.usecase";

describe("ConcernUseCase recommendation feed", () => {
  it("falls back to newest when recommendation history fails", async () => {
    const candidate = {
      concern: new Concern({
        id: "concern-1",
        userId: "author-1",
        body: "推薦対象の投稿",
        createdAt: "2026-09-22T00:00:00.000Z",
      }),
      cluster: new ConcernCluster({
        id: "cluster-1",
        label: "テーマ",
        summary: "テーマの要約",
      }),
      viewed: false,
    };
    const repository: ConcernRepository = {
      insert: async (value) => value,
      listPublished: async () => ({ items: [], hasMore: false }),
      findPublishedById: async () => null,
      listFeed: async () => ({ items: [candidate], hasMore: false }),
      listRecommendationHistory: async () => {
        throw new Error("history unavailable");
      },
    };
    const useCase = new ConcernUseCase(repository);

    await expect(
      useCase.listFeed({
        limit: 1,
        sort: "recommended",
        userId: "user-1",
      }),
    ).resolves.toMatchObject({
      items: [
        {
          concern: { id: "concern-1" },
          recommendation: {
            strategy: "fallback",
            reasonCode: "fallback_newest",
          },
        },
      ],
    });
  });
});
