import { describe, expect, it } from "vitest";

import { Concern } from "../../src/application/entity/concern";
import { ConcernCluster } from "../../src/application/entity/concern-cluster";
import type { ConcernFeedCandidate } from "../../src/application/entity/feed";
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
});

function candidate(
  id: string,
  clusterId?: string,
  readerCount = 0,
): ConcernFeedCandidate {
  return {
    concern: concern({ id, clusterId, createdAt: "2026-09-01T00:00:00.000Z" }),
    cluster: clusterId ? cluster(clusterId) : null,
    viewed: false,
    readerCount,
  };
}

const recentHistory = [
  {
    clusterId: "known",
    regionCode: null,
    viewedAt: "2026-09-02T00:00:00.000Z",
  },
];

describe("インクルーシブな推薦", () => {
  it("身近なテーマから未知のテーマ、届いていない声へ進む", () => {
    const ranked = rankConcernFeedCandidates(
      [
        candidate("a-familiar", "known", 30),
        candidate("z-discovery", "unknown", 20),
        candidate("b-unclassified", undefined, 0),
        candidate("c-familiar", "known", 30),
      ],
      recentHistory,
    );
    expect(
      ranked.slice(0, 3).map((item) => item.recommendation.reasonCode),
    ).toEqual(["familiar_theme", "discovery", "less_heard"]);
    expect(ranked[2]?.concern.id).toBe("b-unclassified");
  });

  it("未分類・属性未回答でも既読より未読を優先する", () => {
    const read = { ...candidate("z-read", "known"), viewed: true };
    const unclassified = candidate("a-unclassified");
    expect(
      rankConcernFeedCandidates([read, unclassified], recentHistory)[0]?.concern
        .id,
    ).toBe("a-unclassified");
  });

  it("履歴がない場合も未分類を減点せず新しい声から始める", () => {
    const classified = candidate("a-classified", "theme");
    const unclassified = candidate("z-unclassified");
    expect(
      rankConcernFeedCandidates([classified, unclassified], [])[0]?.concern.id,
    ).toBe("z-unclassified");
    expect(
      rankConcernFeedCandidates([classified, unclassified], [], null, 1)[0]
        ?.recommendation.reasonCode,
    ).toBe("discovery");
  });

  it("届く機会の枠は閲覧者数、同数なら長く待った声を優先する", () => {
    const old = candidate("a-old");
    const popular = {
      ...candidate("z-popular", "theme", 10),
      reactionCount: 9999,
    };
    const newer = {
      ...candidate("z-new"),
      concern: concern({
        id: "z-new",
        createdAt: "2026-09-02T00:00:00.000Z",
        regionCode: "osaka",
      }),
    };
    expect(
      rankConcernFeedCandidates([popular, newer, old], [], null, 2)[0]?.concern
        .id,
    ).toBe("a-old");
  });

  it("属性の入力やリアクション数だけでは順位を変えない", () => {
    const a = candidate("a", "a");
    const b = candidate("b", "b");
    const changed = {
      ...a,
      reactionCount: 999,
      concern: concern({
        id: "a",
        clusterId: "a",
        regionCode: "osaka",
        createdAt: a.concern.createdAt,
      }),
    };
    for (const slot of [0, 1, 2]) {
      expect(
        rankConcernFeedCandidates([changed, b], [], null, slot).map(
          (item) => item.concern.id,
        ),
      ).toEqual(
        rankConcernFeedCandidates([a, b], [], null, slot).map(
          (item) => item.concern.id,
        ),
      );
    }
  });

  it("候補不足・全件既読でも重複や欠落なく最後まで返す", () => {
    const candidates = [candidate("a", "only"), candidate("b", "only")].map(
      (item) => ({ ...item, viewed: true }),
    );
    const ranked = rankConcernFeedCandidates(candidates, [], "only", 2);
    expect(new Set(ranked.map((item) => item.concern.id))).toEqual(
      new Set(["a", "b"]),
    );
    expect(rankConcernFeedCandidates([], recentHistory)).toEqual([]);
    expect(candidates.map((item) => item.concern.id)).toEqual(["a", "b"]);
  });
});
