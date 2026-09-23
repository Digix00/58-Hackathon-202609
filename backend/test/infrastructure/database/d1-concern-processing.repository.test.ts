import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";

import { D1ConcernRepository } from "../../../src/infrastructure/database/d1-concern.repository";
import { D1ConcernProcessingRepository } from "../../../src/infrastructure/database/d1-concern-processing.repository";
import {
  concernRepresentations,
  concerns,
  users,
} from "../../../src/infrastructure/database/schema";

describe("D1ConcernProcessingRepository", () => {
  it("persists generated representations and exposes the assigned cluster", async () => {
    const now = "2026-09-23T00:00:00.000Z";
    const suffix = crypto.randomUUID();
    const userId = `user-${suffix}`;
    const concernId = `concern-${suffix}`;
    const clusterId = `cluster-${suffix}`;
    const db = drizzle(env.DB);

    await db
      .insert(users)
      .values({
        id: userId,
        lineUserId: `line-${suffix}`,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    await db
      .insert(concerns)
      .values({
        id: concernId,
        userId,
        body: "昼休みに落ち着ける場所がない",
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const repository = new D1ConcernProcessingRepository(env.DB);
    await repository.markProcessing(concernId, now);
    await expect(repository.findState(concernId)).resolves.toEqual({
      clusterId: null,
      status: "processing",
    });
    await expect(
      repository.assignCluster(
        concernId,
        clusterId,
        "@cf/pfnet/plamo-embedding-1b",
        now,
      ),
    ).resolves.toBe(clusterId);
    await repository.saveResult(
      concernId,
      {
        jaHira: "ひるやすみにおちつけるばしょがない",
        en: "No quiet place at lunch.",
      },
      now,
    );

    await expect(repository.findState(concernId)).resolves.toEqual({
      clusterId,
      status: "ready",
    });
    const savedConcern = await new D1ConcernRepository(
      env.DB,
    ).findPublishedById(concernId);
    expect(savedConcern?.cluster).toEqual({
      id: clusterId,
      label: null,
      summary: null,
    });
    const representations = await db
      .select()
      .from(concernRepresentations)
      .where(eq(concernRepresentations.concernId, concernId))
      .all();
    expect(representations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          locale: "ja-Hira",
          body: "ひるやすみにおちつけるばしょがない",
          status: "ready",
        }),
        expect.objectContaining({
          locale: "en",
          body: "No quiet place at lunch.",
          status: "ready",
        }),
      ]),
    );
  });

  it("keeps the first persisted cluster when duplicate attempts race", async () => {
    const now = "2026-09-23T00:00:00.000Z";
    const suffix = crypto.randomUUID();
    const userId = `user-${suffix}`;
    const concernId = `concern-${suffix}`;
    const db = drizzle(env.DB);

    await db
      .insert(users)
      .values({
        id: userId,
        lineUserId: `line-${suffix}`,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    await db
      .insert(concerns)
      .values({
        id: concernId,
        userId,
        body: "重複処理のテスト投稿",
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const repository = new D1ConcernProcessingRepository(env.DB);
    const first = await repository.assignCluster(
      concernId,
      "cluster-first",
      "@cf/pfnet/plamo-embedding-1b",
      now,
    );
    const second = await repository.assignCluster(
      concernId,
      "cluster-retry",
      "@cf/pfnet/plamo-embedding-1b",
      now,
    );

    expect(first).toBe("cluster-first");
    expect(second).toBe("cluster-first");
  });
});
