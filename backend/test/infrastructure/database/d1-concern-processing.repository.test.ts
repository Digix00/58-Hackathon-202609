import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";

import { ConcernProcessing } from "../../../src/application/entity/concern-processing";
import { D1ConcernProcessingRepository } from "../../../src/infrastructure/database/d1-concern-processing.repository";
import { concerns, users } from "../../../src/infrastructure/database/schema";

async function seedReadyConcern(id: string): Promise<void> {
  const timestamp = "2026-09-23T00:00:00.000Z";
  await drizzle(env.DB)
    .insert(users)
    .values({
      id: `processing-user-${id}`,
      lineUserId: `processing-line-${id}`,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .run();
  await drizzle(env.DB)
    .insert(concerns)
    .values({
      id,
      userId: `processing-user-${id}`,
      body: "公開済みの悩み",
      processingStatus: "ready",
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .run();
}

describe("D1ConcernProcessingRepository.markFailed", () => {
  it("only transitions ready concerns when the caller opts in", async () => {
    const preservedId = `ready-preserved-${crypto.randomUUID()}`;
    const retryId = `ready-retry-${crypto.randomUUID()}`;
    const timestamp = "2026-09-24T00:00:00.000Z";
    await seedReadyConcern(preservedId);
    await seedReadyConcern(retryId);
    const repository = new D1ConcernProcessingRepository(env.DB);

    await repository.markFailed(
      new ConcernProcessing({
        concernId: preservedId,
        status: "failed",
        updatedAt: timestamp,
      }),
    );
    await repository.markFailed(
      new ConcernProcessing({
        concernId: retryId,
        status: "failed",
        updatedAt: timestamp,
      }),
      { allowReady: true },
    );

    const rows = await drizzle(env.DB)
      .select({ id: concerns.id, status: concerns.processingStatus })
      .from(concerns)
      .where(eq(concerns.id, preservedId))
      .all();
    const retry = await drizzle(env.DB)
      .select({ status: concerns.processingStatus })
      .from(concerns)
      .where(eq(concerns.id, retryId))
      .get();

    expect(rows[0]?.status).toBe("ready");
    expect(retry?.status).toBe("failed");
  });
});
