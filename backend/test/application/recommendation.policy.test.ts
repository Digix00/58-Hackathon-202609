import { describe, expect, it } from "vitest";

import { Concern } from "../../src/application/entity/concern";
import { ConcernCluster } from "../../src/application/entity/concern-cluster";
import { rankConcernFeedCandidates } from "../../src/application/recommendation/recommendation.policy";

function concern(input: {
  id: string;
  createdAt: string;
  clusterId?: string;
  regionCode?: string;
}) {
  return new Concern({
    id: input.id,
    userId: `user-${input.id}`,
    body: `本文-${input.id}`,
    clusterId: input.clusterId,
    regionCode: input.regionCode,
    createdAt: input.createdAt,
  });
}

function cluster(id: string) {
  return new ConcernCluster({
    id,
    label: `テーマ-${id}`,
    summary: `要約-${id}`,
  });
}

describe("rankConcernFeedCandidates", () => {
  it("prioritizes unread cluster candidates and then diversifies regions", () => {
    const ranked = rankConcernFeedCandidates(
      [
        {
          concern: concern({
            id: "old-read",
            clusterId: "known",
            regionCode: "osaka",
            createdAt: "2026-09-01T00:00:00.000Z",
          }),
          cluster: cluster("known"),
          viewed: true,
        },
        {
          concern: concern({
            id: "unread-new",
            clusterId: "new",
            regionCode: "tokyo",
            createdAt: "2026-09-02T00:00:00.000Z",
          }),
          cluster: cluster("new"),
          viewed: false,
        },
      ],
      [
        {
          clusterId: "known",
          regionCode: "osaka",
          viewedAt: "2026-09-03T00:00:00.000Z",
        },
      ],
    );

    expect(ranked.map((item) => item.concern.id)).toEqual([
      "unread-new",
      "old-read",
    ]);
    expect(ranked[0]?.recommendation).toEqual({
      strategy: "recommended",
      reasonCode: "unread_cluster",
    });
  });
});
