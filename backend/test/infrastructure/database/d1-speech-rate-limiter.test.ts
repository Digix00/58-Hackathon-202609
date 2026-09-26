import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { D1SpeechRateLimiter } from "../../../src/infrastructure/database/d1-speech-rate-limiter";

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const REQUEST_SPACING_MS = 2 * MINUTE_MS;

describe("D1SpeechRateLimiter", () => {
  let userId: string;
  let now: number;

  beforeEach(async () => {
    userId = crypto.randomUUID();
    now = Date.parse("2026-09-25T12:00:00.000Z");
    const createdAt = new Date(now).toISOString();
    await env.DB.prepare(
      "INSERT INTO users (id, line_user_id, created_at, updated_at) VALUES (?, ?, ?, ?)",
    )
      .bind(userId, `speech-rate-${userId}`, createdAt, createdAt)
      .run();
  });

  afterEach(async () => {
    await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(userId).run();
  });

  it("allows 10 requests per rolling minute and returns the reset delay", async () => {
    const limiter = new D1SpeechRateLimiter(env.DB, () => now);

    for (let request = 0; request < 10; request += 1) {
      await expect(limiter.consume(userId)).resolves.toEqual({ allowed: true });
    }
    await expect(limiter.consume(userId)).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 60,
    });

    now += MINUTE_MS - 1;
    await expect(limiter.consume(userId)).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 1,
    });

    now += 1;
    await expect(limiter.consume(userId)).resolves.toEqual({ allowed: true });
  });

  it("keeps each authenticated user on an independent quota", async () => {
    const otherUserId = crypto.randomUUID();
    const createdAt = new Date(now).toISOString();
    await env.DB.prepare(
      "INSERT INTO users (id, line_user_id, created_at, updated_at) VALUES (?, ?, ?, ?)",
    )
      .bind(otherUserId, `speech-rate-${otherUserId}`, createdAt, createdAt)
      .run();

    try {
      const limiter = new D1SpeechRateLimiter(env.DB, () => now);
      for (let request = 0; request < 10; request += 1) {
        await limiter.consume(userId);
      }
      await expect(limiter.consume(userId)).resolves.toMatchObject({
        allowed: false,
      });
      await expect(limiter.consume(otherUserId)).resolves.toEqual({
        allowed: true,
      });
    } finally {
      await env.DB.prepare("DELETE FROM users WHERE id = ?")
        .bind(otherUserId)
        .run();
    }
  });

  it("allows no more than 200 requests in a rolling day", async () => {
    await env.DB.prepare(
      `WITH RECURSIVE sequence(n) AS (
         SELECT 0
         UNION ALL
         SELECT n + 1 FROM sequence WHERE n < 199
       )
       INSERT INTO speech_transcription_rate_limit_events (user_id, created_at)
       SELECT ?, ? - n * ? FROM sequence`,
    )
      .bind(userId, now, REQUEST_SPACING_MS)
      .run();
    const limiter = new D1SpeechRateLimiter(env.DB, () => now);

    const result = await limiter.consume(userId);
    expect(result).toEqual({
      allowed: false,
      retryAfterSeconds: Math.ceil((DAY_MS - 199 * REQUEST_SPACING_MS) / 1_000),
    });

    now += DAY_MS - 199 * REQUEST_SPACING_MS;
    await expect(limiter.consume(userId)).resolves.toEqual({ allowed: true });
  });

  it("enforces the per-minute limit atomically for concurrent requests", async () => {
    const limiter = new D1SpeechRateLimiter(env.DB, () => now);

    const results = await Promise.all(
      Array.from({ length: 15 }, () => limiter.consume(userId)),
    );

    expect(results.filter((result) => result.allowed)).toHaveLength(10);
    expect(results.filter((result) => !result.allowed)).toHaveLength(5);
  });
});
