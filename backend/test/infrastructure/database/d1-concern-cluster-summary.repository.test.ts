import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";

import {
  ConcernCluster,
  ConcernClusterSummaryClaim,
} from "../../../src/application/entity/concern-cluster";
import { D1ConcernClusterSummaryRepository } from "../../../src/infrastructure/database/d1-concern-cluster-summary.repository";
import {
  concernClusters,
  concerns,
  users,
} from "../../../src/infrastructure/database/schema";

async function seedPendingCluster(id: string): Promise<void> {
  const timestamp = "2026-09-24T00:00:00.000Z";
  await drizzle(env.DB)
    .insert(concernClusters)
    .values({
      id,
      legacyLabel: "__pending__",
      legacySummary: "__pending__",
      label: null,
      summary: null,
      status: "pending",
      modelVersion: "@cf/qwen/qwen3-embedding-0.6b",
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .run();
}

async function seedConcern(input: {
  clusterId: string;
  body: string;
  visibilityStatus?: "published" | "hidden";
  createdAt: string;
}): Promise<void> {
  const suffix = crypto.randomUUID();
  await drizzle(env.DB)
    .insert(users)
    .values({
      id: `summary-user-${suffix}`,
      lineUserId: `summary-line-${suffix}`,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    })
    .run();
  await drizzle(env.DB)
    .insert(concerns)
    .values({
      id: `summary-concern-${suffix}`,
      userId: `summary-user-${suffix}`,
      body: input.body,
      clusterId: input.clusterId,
      visibilityStatus: input.visibilityStatus ?? "published",
      processingStatus: "processing",
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    })
    .run();
}

describe("D1ConcernClusterSummaryRepository", () => {
  it("claims only published concern text and bounds the model input", async () => {
    const clusterId = `summary-cluster-${crypto.randomUUID()}`;
    await seedPendingCluster(clusterId);
    for (let index = 0; index < 12; index++) {
      await seedConcern({
        clusterId,
        body: `公開悩み-${index}`,
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
      });
    }
    await seedConcern({
      clusterId,
      body: "非公開の内容はAIへ送らない",
      visibilityStatus: "hidden",
      createdAt: "2026-12-01T00:00:00.000Z",
    });

    const repository = new D1ConcernClusterSummaryRepository(env.DB);
    const claim = await repository.claimPendingSummaryInput(
      clusterId,
      "2026-09-24T00:01:00.000Z",
      "2026-09-23T23:56:00.000Z",
    );

    expect(claim).toBeInstanceOf(ConcernClusterSummaryClaim);
    expect(claim?.input.concernBodies).toHaveLength(10);
    expect(claim?.input.concernBodies[0]).toBe("公開悩み-11");
    expect(claim?.input.concernBodies[9]).toBe("公開悩み-2");
    expect(claim?.input.concernBodies).not.toContain(
      "非公開の内容はAIへ送らない",
    );
  });

  it("only skips completed clusters and releases empty claims", async () => {
    const readyClusterId = `summary-ready-${crypto.randomUUID()}`;
    const emptyClusterId = `summary-empty-${crypto.randomUUID()}`;
    const timestamp = "2026-09-24T00:00:00.000Z";
    await drizzle(env.DB)
      .insert(concernClusters)
      .values({
        id: readyClusterId,
        legacyLabel: "既存ラベル",
        legacySummary: "既存要約",
        label: "既存ラベル",
        summary: "既存要約",
        status: "ready",
        modelVersion: "test",
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();
    await seedPendingCluster(emptyClusterId);

    const repository = new D1ConcernClusterSummaryRepository(env.DB);

    await expect(
      repository.claimPendingSummaryInput(
        "missing",
        "2026-09-24T00:01:00.000Z",
        "2026-09-23T23:56:00.000Z",
      ),
    ).rejects.toThrow("Concern cluster not found");
    await expect(
      repository.claimPendingSummaryInput(
        readyClusterId,
        "2026-09-24T00:01:00.000Z",
        "2026-09-23T23:56:00.000Z",
      ),
    ).resolves.toBeNull();
    await expect(
      repository.claimPendingSummaryInput(
        emptyClusterId,
        "2026-09-24T00:01:00.000Z",
        "2026-09-23T23:56:00.000Z",
      ),
    ).rejects.toThrow("No published concerns");
    const emptyCluster = await drizzle(env.DB)
      .select({ status: concernClusters.status })
      .from(concernClusters)
      .where(eq(concernClusters.id, emptyClusterId))
      .get();
    expect(emptyCluster?.status).toBe("pending");
  });

  it("allows only one concurrent delivery to claim a pending cluster", async () => {
    const clusterId = `summary-claim-${crypto.randomUUID()}`;
    await seedPendingCluster(clusterId);
    await seedConcern({
      clusterId,
      body: "公開された悩み",
      createdAt: "2026-09-24T00:00:00.000Z",
    });
    const repository = new D1ConcernClusterSummaryRepository(env.DB);
    const claim = () =>
      repository.claimPendingSummaryInput(
        clusterId,
        "2026-09-24T00:01:00.000Z",
        "2026-09-23T23:56:00.000Z",
      );

    const outcomes = await Promise.allSettled([claim(), claim()]);
    const claims = outcomes.flatMap((outcome) =>
      outcome.status === "fulfilled" ? [outcome.value] : [],
    );

    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(claims.filter(Boolean)[0]?.input.concernBodies).toEqual([
      "公開された悩み",
    ]);
    expect(
      outcomes.filter((outcome) => outcome.status === "rejected"),
    ).toHaveLength(1);
    await expect(claim()).rejects.toThrow("already in progress");
  });

  it("reclaims an expired lease and only allows its current owner to save or release", async () => {
    const clusterId = `summary-lease-${crypto.randomUUID()}`;
    await seedPendingCluster(clusterId);
    await seedConcern({
      clusterId,
      body: "公開された悩み",
      createdAt: "2026-09-24T00:00:00.000Z",
    });
    const repository = new D1ConcernClusterSummaryRepository(env.DB);
    const firstClaim = await repository.claimPendingSummaryInput(
      clusterId,
      "2026-09-24T00:01:00.000Z",
      "2026-09-23T23:56:00.000Z",
    );
    const retryClaim = await repository.claimPendingSummaryInput(
      clusterId,
      "2026-09-24T00:10:00.000Z",
      "2026-09-24T00:05:00.000Z",
    );
    expect(firstClaim).not.toBeNull();
    expect(retryClaim?.claimedAt).toBe("2026-09-24T00:10:00.000Z");

    const staleSummary = new ConcernCluster({
      id: clusterId,
      label: "古い要約",
      summary: "期限切れのclaimからは保存できません。",
      status: "ready",
      updatedAt: "2026-09-24T00:11:00.000Z",
    });
    await expect(
      repository.saveSummary(staleSummary, firstClaim?.claimedAt ?? ""),
    ).rejects.toThrow("Cluster summary claim was lost");
    await repository.releaseSummaryClaim(
      clusterId,
      firstClaim?.claimedAt ?? "",
      "2026-09-24T00:12:00.000Z",
    );

    await repository.saveSummary(
      new ConcernCluster({
        id: clusterId,
        label: "学校での人間関係",
        summary: "友人との距離感や、周囲に相談しづらい悩みです。",
        status: "ready",
        updatedAt: "2026-09-24T00:13:00.000Z",
      }),
      retryClaim?.claimedAt ?? "",
    );

    const saved = await drizzle(env.DB)
      .select()
      .from(concernClusters)
      .where(eq(concernClusters.id, clusterId))
      .get();
    expect(saved).toMatchObject({
      label: "学校での人間関係",
      summary: "友人との距離感や、周囲に相談しづらい悩みです。",
      status: "ready",
      modelVersion: "@cf/qwen/qwen3-embedding-0.6b",
    });
  });

  it("releases a failed claim so a queue retry can claim it", async () => {
    const clusterId = `summary-release-${crypto.randomUUID()}`;
    await seedPendingCluster(clusterId);
    await seedConcern({
      clusterId,
      body: "公開された悩み",
      createdAt: "2026-09-24T00:00:00.000Z",
    });
    const repository = new D1ConcernClusterSummaryRepository(env.DB);
    const claim = await repository.claimPendingSummaryInput(
      clusterId,
      "2026-09-24T00:01:00.000Z",
      "2026-09-23T23:56:00.000Z",
    );
    expect(claim).not.toBeNull();

    await repository.releaseSummaryClaim(
      clusterId,
      claim?.claimedAt ?? "",
      "2026-09-24T00:02:00.000Z",
    );

    const retry = await repository.claimPendingSummaryInput(
      clusterId,
      "2026-09-24T00:03:00.000Z",
      "2026-09-23T23:58:00.000Z",
    );
    expect(retry?.input.concernBodies).toEqual(["公開された悩み"]);
  });

  it("saves a summary once and preserves the embedding model version", async () => {
    const clusterId = `summary-save-${crypto.randomUUID()}`;
    await seedPendingCluster(clusterId);
    await seedConcern({
      clusterId,
      body: "公開された悩み",
      createdAt: "2026-09-24T00:00:00.000Z",
    });
    const repository = new D1ConcernClusterSummaryRepository(env.DB);
    const claim = await repository.claimPendingSummaryInput(
      clusterId,
      "2026-09-24T00:01:00.000Z",
      "2026-09-23T23:56:00.000Z",
    );
    expect(claim).not.toBeNull();
    const summary = new ConcernCluster({
      id: clusterId,
      label: "学校での人間関係",
      summary: "友人との距離感や、周囲に相談しづらい悩みです。",
      status: "ready",
      updatedAt: "2026-09-24T00:01:00.000Z",
    });

    await repository.saveSummary(summary, claim?.claimedAt ?? "");
    await expect(
      repository.saveSummary(
        new ConcernCluster({
          id: clusterId,
          label: "上書きされないラベル",
          summary: "すでに完了した要約は上書きしません。",
          status: "ready",
          updatedAt: "2026-09-24T00:02:00.000Z",
        }),
        claim?.claimedAt ?? "",
      ),
    ).rejects.toThrow("Cluster summary claim was lost");

    const saved = await drizzle(env.DB)
      .select()
      .from(concernClusters)
      .where(
        and(
          eq(concernClusters.id, clusterId),
          eq(concernClusters.status, "ready"),
        ),
      )
      .get();
    expect(saved).toMatchObject({
      label: "学校での人間関係",
      summary: "友人との距離感や、周囲に相談しづらい悩みです。",
      status: "ready",
      modelVersion: "@cf/qwen/qwen3-embedding-0.6b",
      legacyLabel: "__pending__",
      legacySummary: "__pending__",
    });
  });
});
