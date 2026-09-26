import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";

import { Concern } from "../../../src/application/entity/concern";
import { D1ConcernRepository } from "../../../src/infrastructure/database/d1-concern.repository";
import { concerns, users } from "../../../src/infrastructure/database/schema";

async function seedUser(id: string): Promise<void> {
  const timestamp = "2026-09-22T00:00:00.000Z";
  await drizzle(env.DB)
    .insert(users)
    .values({
      id,
      lineUserId: `line-${id}`,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .run();
}

describe("D1ConcernRepository.insert", () => {
  it("falls back to the user's profile when the concern has no explicit attributes", async () => {
    const userId = `profile-fallback-${crypto.randomUUID()}`;
    await seedUser(userId);
    const repository = new D1ConcernRepository(
      env.DB,
      () => new Date("2026-09-22T00:00:00.000Z"),
    );
    const concern = new Concern({
      id: `concern-${userId}`,
      userId,
      body: "属性はプロフィールから補われる投稿",
      createdAt: "2026-09-22T00:00:00.000Z",
    });

    const saved = await repository.insert(concern, {
      birthYear: 2006,
      birthMonth: 8,
      gender: "female",
      regionCode: "osaka",
    });

    expect(saved.ageGroup).toBe("20s");
    expect(saved.gender).toBe("female");
    expect(saved.regionCode).toBe("osaka");

    const row = await drizzle(env.DB)
      .select()
      .from(concerns)
      .where(eq(concerns.id, concern.id))
      .get();
    expect(row).toMatchObject({
      ageGroup: "20s",
      genderCode: "female",
      regionCode: "osaka",
    });
  });

  it("prefers the concern's explicit attributes over the user's profile", async () => {
    const userId = `profile-override-${crypto.randomUUID()}`;
    await seedUser(userId);
    const repository = new D1ConcernRepository(
      env.DB,
      () => new Date("2026-09-22T00:00:00.000Z"),
    );
    const concern = new Concern({
      id: `concern-${userId}`,
      userId,
      body: "明示的な属性を優先する投稿",
      ageGroup: "30s",
      gender: "male",
      regionCode: "tokyo",
      createdAt: "2026-09-22T00:00:00.000Z",
    });

    const saved = await repository.insert(concern, {
      birthYear: 2006,
      birthMonth: 8,
      gender: "female",
      regionCode: "osaka",
    });

    expect(saved.ageGroup).toBe("30s");
    expect(saved.gender).toBe("male");
    expect(saved.regionCode).toBe("tokyo");
  });

  it("stores null attributes when no profile is provided", async () => {
    const userId = `no-profile-${crypto.randomUUID()}`;
    await seedUser(userId);
    const repository = new D1ConcernRepository(env.DB);
    const concern = new Concern({
      id: `concern-${userId}`,
      userId,
      body: "プロフィール未設定の投稿",
      createdAt: "2026-09-22T00:00:00.000Z",
    });

    const saved = await repository.insert(concern);

    expect(saved.ageGroup).toBeNull();
    expect(saved.gender).toBeNull();
    expect(saved.regionCode).toBeNull();
  });
});
