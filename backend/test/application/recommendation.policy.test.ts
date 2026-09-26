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

  it("does not select the same cluster consecutively when another cluster is available", () => {
    const ranked = rankConcernFeedCandidates(
      [
        ...["x-1", "x-2"].map((id, index) => ({
          concern: concern({
            id,
            clusterId: "cluster-x",
            createdAt: `2026-09-0${index + 1}T00:00:00.000Z`,
          }),
          cluster: cluster("cluster-x"),
          viewed: false,
        })),
        ...["y-1", "y-2"].map((id, index) => ({
          concern: concern({
            id,
            clusterId: "cluster-y",
            createdAt: `2026-08-0${index + 1}T00:00:00.000Z`,
          }),
          cluster: cluster("cluster-y"),
          viewed: true,
        })),
      ],
      [],
    );

    expect(ranked.map((item) => item.concern.id)).toEqual([
      "x-2",
      "y-2",
      "x-1",
      "y-1",
    ]);
  });

  it("allows the same cluster when no other cluster remains", () => {
    const ranked = rankConcernFeedCandidates(
      [
        {
          concern: concern({
            id: "x-1",
            clusterId: "cluster-x",
            createdAt: "2026-09-02T00:00:00.000Z",
          }),
          cluster: cluster("cluster-x"),
          viewed: false,
        },
        {
          concern: concern({
            id: "x-2",
            clusterId: "cluster-x",
            createdAt: "2026-09-01T00:00:00.000Z",
          }),
          cluster: cluster("cluster-x"),
          viewed: false,
        },
      ],
      [],
      "cluster-x",
    );

    expect(ranked.map((item) => item.concern.id)).toEqual(["x-1", "x-2"]);
  });

  it("includes the viewer's own post without the unread bonus", () => {
    const ranked = rankConcernFeedCandidates(
      [
        {
          concern: concern({
            id: "own",
            clusterId: "cluster-own",
            createdAt: "2026-09-02T00:00:00.000Z",
          }),
          cluster: cluster("cluster-own"),
          viewed: false,
        },
        {
          concern: concern({
            id: "other",
            clusterId: "cluster-other",
            createdAt: "2026-09-01T00:00:00.000Z",
          }),
          cluster: cluster("cluster-other"),
          viewed: false,
        },
      ],
      [],
      null,
      "user-own",
    );

    expect(ranked.map((item) => item.concern.id)).toEqual(["other", "own"]);
    expect(ranked[0]?.recommendation.reasonCode).toBe("unread_cluster");
    expect(ranked[1]?.recommendation.reasonCode).toBe("own_post");
    expect(ranked[1]?.viewed).toBe(false);
  });
});
