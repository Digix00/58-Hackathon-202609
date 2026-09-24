import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";

import {
  ConcernCluster,
  ConcernClusterSummaryInput,
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
  it("loads only published concern text and bounds the summary input", async () => {
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
    const input = await repository.findPendingSummaryInput(clusterId);

    expect(input).toBeInstanceOf(ConcernClusterSummaryInput);
    expect(input?.concernBodies).toHaveLength(10);
    expect(input?.concernBodies[0]).toBe("公開悩み-11");
    expect(input?.concernBodies[9]).toBe("公開悩み-2");
    expect(input?.concernBodies).not.toContain("非公開の内容はAIへ送らない");
  });

  it("does not request a new summary for missing, ready, or empty clusters", async () => {
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
      repository.findPendingSummaryInput("missing"),
    ).resolves.toBeNull();
    await expect(
      repository.findPendingSummaryInput(readyClusterId),
    ).resolves.toBeNull();
    await expect(
      repository.findPendingSummaryInput(emptyClusterId),
    ).resolves.toBeNull();
  });

  it("saves a summary once and preserves the embedding model version", async () => {
    const clusterId = `summary-save-${crypto.randomUUID()}`;
    await seedPendingCluster(clusterId);
    const repository = new D1ConcernClusterSummaryRepository(env.DB);
    const summary = new ConcernCluster({
      id: clusterId,
      label: "学校での人間関係",
      summary: "友人との距離感や、周囲に相談しづらい悩みです。",
      status: "ready",
      updatedAt: "2026-09-24T00:01:00.000Z",
    });

    await repository.saveSummary(summary);
    await repository.saveSummary(
      new ConcernCluster({
        id: clusterId,
        label: "上書きされないラベル",
        summary: "すでに完了した要約は上書きしません。",
        status: "ready",
        updatedAt: "2026-09-24T00:02:00.000Z",
      }),
    );

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
