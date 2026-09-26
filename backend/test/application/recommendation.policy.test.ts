import { describe, expect, it } from "vitest";

import { type AgeGroup, Concern } from "../../src/application/entity/concern";
import { ConcernCluster } from "../../src/application/entity/concern-cluster";
import type { ConcernFeedCandidate } from "../../src/application/entity/feed";
import { rankConcernFeedCandidates } from "../../src/application/recommendation/recommendation.policy";

function concern(input: {
  id: string;
  createdAt: string;
  clusterId?: string;
  regionCode?: string;
  ageGroup?: AgeGroup;
}) {
  return new Concern({
    id: input.id,
    userId: `user-${input.id}`,
    body: `本文-${input.id}`,
    clusterId: input.clusterId,
    regionCode: input.regionCode,
    ageGroup: input.ageGroup,
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
      { previousClusterId: "cluster-x" },
    );

    expect(ranked.map((item) => item.concern.id)).toEqual(["x-1", "x-2"]);
  });

  it("prioritizes posts from the viewer's prefecture and then area", () => {
    const ranked = rankConcernFeedCandidates(
      [
        candidate({
          id: "tokyo",
          clusterId: "c-1",
          regionCode: "tokyo",
          day: 5,
        }),
        candidate({
          id: "kyoto",
          clusterId: "c-2",
          regionCode: "kyoto",
          day: 4,
        }),
        candidate({
          id: "osaka",
          clusterId: "c-3",
          regionCode: "osaka",
          day: 3,
        }),
      ],
      [],
      { viewerRegionCode: "osaka", pageSize: 10 },
    );

    expect(ranked.map((item) => item.concern.id)).toEqual([
      "osaka",
      "kyoto",
      "tokyo",
    ]);
    expect(ranked.map((item) => item.recommendation.reasonCode)).toEqual([
      "nearby_prefecture",
      "nearby_area",
      "unread_cluster",
    ]);
  });

  it("limits nearby boosts to a share of each page", () => {
    const ranked = rankConcernFeedCandidates(
      [
        candidate({
          id: "osaka-1",
          clusterId: "c-1",
          regionCode: "osaka",
          day: 9,
        }),
        candidate({
          id: "osaka-2",
          clusterId: "c-2",
          regionCode: "osaka",
          day: 8,
        }),
        candidate({
          id: "osaka-3",
          clusterId: "c-3",
          regionCode: "osaka",
          day: 7,
        }),
        candidate({
          id: "tokyo",
          clusterId: "c-4",
          regionCode: "tokyo",
          day: 1,
        }),
      ],
      [],
      { viewerRegionCode: "osaka", pageSize: 4 },
    );

    expect(ranked.map((item) => item.concern.id)).toEqual([
      "osaka-1",
      "tokyo",
      "osaka-2",
      "osaka-3",
    ]);
    expect(
      ranked.filter(
        (item) => item.recommendation.reasonCode === "nearby_prefecture",
      ),
    ).toHaveLength(1);
  });

  it("does not boost nearby posts when the viewer has no region", () => {
    const ranked = rankConcernFeedCandidates(
      [
        candidate({
          id: "tokyo",
          clusterId: "c-1",
          regionCode: "tokyo",
          day: 5,
        }),
        candidate({
          id: "osaka",
          clusterId: "c-2",
          regionCode: "osaka",
          day: 3,
        }),
      ],
      [],
      { viewerRegionCode: null },
    );

    expect(ranked.map((item) => item.concern.id)).toEqual(["tokyo", "osaka"]);
  });

  it("demotes clusters that dominate the recent reading history", () => {
    const history = [
      ...Array.from({ length: 4 }, () => ({
        clusterId: "often",
        regionCode: null,
        viewedAt: "2026-09-01T00:00:00.000Z",
      })),
      {
        clusterId: "rare",
        regionCode: null,
        viewedAt: "2026-09-01T00:00:00.000Z",
      },
    ];
    const ranked = rankConcernFeedCandidates(
      [
        candidate({ id: "often-new", clusterId: "often", day: 9 }),
        candidate({ id: "rare-old", clusterId: "rare", day: 1 }),
      ],
      history,
    );

    expect(ranked.map((item) => item.concern.id)).toEqual([
      "rare-old",
      "often-new",
    ]);
  });

  it("caps the same cluster within a page even without consecutive picks", () => {
    const viewedAt = "2026-09-01T00:00:00.000Z";
    const ranked = rankConcernFeedCandidates(
      [
        candidate({ id: "a-1", clusterId: "a", day: 9 }),
        candidate({ id: "b-1", clusterId: "b", day: 8 }),
        candidate({ id: "a-2", clusterId: "a", day: 7 }),
        candidate({ id: "c-1", clusterId: "c", day: 1 }),
      ],
      [
        { clusterId: "c", regionCode: null, viewedAt },
        { clusterId: "x", regionCode: null, viewedAt },
        { clusterId: "x", regionCode: null, viewedAt },
        { clusterId: "x", regionCode: null, viewedAt },
      ],
      { pageSize: 4 },
    );

    // 上限がなければ新しいa-2が先になるが、クラスタaはこのページの上限（1件）に達している。
    expect(ranked.map((item) => item.concern.id)).toEqual([
      "a-1",
      "b-1",
      "c-1",
      "a-2",
    ]);
  });

  it("spreads age groups within a page", () => {
    const ranked = rankConcernFeedCandidates(
      [
        candidate({ id: "20s-1", day: 9, ageGroup: "20s" }),
        candidate({ id: "20s-2", day: 8, ageGroup: "20s" }),
        candidate({ id: "60s", day: 7, ageGroup: "60s" }),
      ],
      [],
    );

    expect(ranked.map((item) => item.concern.id)).toEqual([
      "20s-1",
      "60s",
      "20s-2",
    ]);
  });

  it("demotes posts shown repeatedly without being opened", () => {
    const ranked = rankConcernFeedCandidates(
      [
        candidate({ id: "ignored", clusterId: "c-1", day: 9 }),
        candidate({ id: "fresh", clusterId: "c-2", day: 1 }),
      ],
      [],
      { unopenedExposureCounts: new Map([["ignored", 3]]) },
    );

    expect(ranked.map((item) => item.concern.id)).toEqual(["fresh", "ignored"]);
  });

  it("keeps a single unopened exposure from demoting a post", () => {
    const ranked = rankConcernFeedCandidates(
      [
        candidate({ id: "seen-once", clusterId: "c-1", day: 9 }),
        candidate({ id: "other", clusterId: "c-2", day: 1 }),
      ],
      [],
      { unopenedExposureCounts: new Map([["seen-once", 1]]) },
    );

    expect(ranked.map((item) => item.concern.id)).toEqual([
      "seen-once",
      "other",
    ]);
  });

  it("returns the same order for the same viewer and day", () => {
    const candidates = Array.from({ length: 12 }, (_, index) =>
      candidate({ id: `c-${index}`, day: 1 }),
    );
    const options = {
      viewerUserId: "viewer",
      now: new Date("2026-09-26T12:00:00.000Z"),
    };

    const first = rankConcernFeedCandidates(candidates, [], options);
    const second = rankConcernFeedCandidates(candidates, [], options);

    expect(first.map((item) => item.concern.id)).toEqual(
      second.map((item) => item.concern.id),
    );
    expect(new Set(first.map((item) => item.concern.id)).size).toBe(12);
  });
});

function candidate(input: {
  id: string;
  day: number;
  clusterId?: string;
  regionCode?: string;
  ageGroup?: AgeGroup;
  viewed?: boolean;
}): ConcernFeedCandidate {
  return {
    concern: concern({
      id: input.id,
      clusterId: input.clusterId,
      regionCode: input.regionCode,
      ageGroup: input.ageGroup,
      createdAt: `2026-09-${String(input.day).padStart(2, "0")}T00:00:00.000Z`,
    }),
    cluster: input.clusterId ? cluster(input.clusterId) : null,
    viewed: input.viewed ?? false,
  };
}
