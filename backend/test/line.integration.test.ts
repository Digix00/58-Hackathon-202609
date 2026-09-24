import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app/create-app";
import type { ClaimDailyBroadcastInput } from "../src/application/repository/line.repository";
import { LineUseCase } from "../src/application/usecase/line.usecase";
import { D1LineRepository } from "../src/infrastructure/database/d1-line.repository";
import {
  concerns,
  quizOptions,
  quizParticipants,
  quizzes,
  users,
} from "../src/infrastructure/database/schema";
import { HmacLineSignatureVerifier } from "../src/infrastructure/line/hmac-line-signature.verifier";
import { HealthHandler } from "../src/presentation/health.handler";
import { LineHandler } from "../src/presentation/line.handler";
import { createAuthDependencies } from "./support/auth-fixture";
import { createConcernDependencies } from "./support/concern-fixture";
import { createUserDependencies } from "./support/user-fixture";

const quizDate = "2099-12-30";
const fixedNow = new Date("2099-12-30T00:00:00.000Z");
const lineChannelSecret = "unit-test-channel-secret";

function createTestApp() {
  const repository = new D1LineRepository(env.DB);
  let sendCount = 0;
  const lineUseCase = new LineUseCase(
    repository,
    new HmacLineSignatureVerifier(lineChannelSecret),
    {
      isConfigured: () => true,
      sendDailyQuiz: async () => {
        sendCount += 1;
        return {
          status: "accepted",
          httpStatus: 200,
          requestId: "line-request-test",
          acceptedRequestId: null,
        };
      },
    },
    { ensureDailyQuiz: async () => null },
    "https://frontend.example",
    () => new Date(fixedNow),
  );
  const app = createApp({
    ...createAuthDependencies(),
    ...createConcernDependencies(),
    ...createUserDependencies(),
    healthHandler: new HealthHandler({
      execute: async () => ({
        status: "ok",
        checkedAt: fixedNow.toISOString(),
        database: "ok",
        version: "test",
      }),
    }),
    lineHandler: new LineHandler(lineUseCase),
  });
  return { app, getSendCount: () => sendCount };
}

describe("LINE webhook integration", () => {
  it("verifies the raw body, deduplicates events, and ignores text messages", async () => {
    const { app } = createTestApp();
    const lineUserId = `line-webhook-${crypto.randomUUID()}`;
    const followEvent = {
      webhookEventId: `webhook-follow-${crypto.randomUUID()}`,
      type: "follow",
      source: { type: "user", userId: lineUserId },
    };
    const followBody = JSON.stringify({ events: [followEvent] });
    const badSignature = await signBody("different-secret", followBody);
    const rejected = await app.request(
      "/api/v1/webhooks/line",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-line-signature": badSignature,
        },
        body: followBody,
      },
      { DB: env.DB },
    );
    expect(rejected.status).toBe(401);

    const signature = await signBody(lineChannelSecret, followBody);
    const accepted = await app.request(
      "/api/v1/webhooks/line",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-line-signature": signature,
        },
        body: followBody,
      },
      { DB: env.DB },
    );
    const duplicate = await app.request(
      "/api/v1/webhooks/line",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-line-signature": signature,
        },
        body: followBody,
      },
      { DB: env.DB },
    );
    expect(accepted.status).toBe(200);
    expect(duplicate.status).toBe(200);

    const db = drizzle(env.DB);
    const followedUser = await db
      .select()
      .from(users)
      .where(eq(users.lineUserId, lineUserId))
      .get();
    expect(followedUser).toMatchObject({
      friendStatus: "active",
      joinedAt: fixedNow.toISOString(),
      lastSeenAt: fixedNow.toISOString(),
    });

    const unfollowEvent = {
      webhookEventId: `webhook-unfollow-${crypto.randomUUID()}`,
      type: "unfollow",
      source: { type: "user", userId: lineUserId },
    };
    const unfollowBody = JSON.stringify({ events: [unfollowEvent] });
    await app.request(
      "/api/v1/webhooks/line",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-line-signature": await signBody(lineChannelSecret, unfollowBody),
        },
        body: unfollowBody,
      },
      { DB: env.DB },
    );
    const unfollowedUser = await db
      .select()
      .from(users)
      .where(eq(users.lineUserId, lineUserId))
      .get();
    expect(unfollowedUser).toMatchObject({
      friendStatus: "unfollowed",
      joinedAt: fixedNow.toISOString(),
      unfollowedAt: fixedNow.toISOString(),
    });

    const textUserId = `line-text-${crypto.randomUUID()}`;
    const textBody = JSON.stringify({
      events: [
        {
          webhookEventId: `webhook-message-${crypto.randomUUID()}`,
          type: "message",
          source: { type: "user", userId: textUserId },
          message: { type: "text", text: "この文章は投稿にしない" },
        },
      ],
    });
    const ignored = await app.request(
      "/api/v1/webhooks/line",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-line-signature": await signBody(lineChannelSecret, textBody),
        },
        body: textBody,
      },
      { DB: env.DB },
    );
    expect(ignored.status).toBe(200);
    expect(
      await db
        .select()
        .from(users)
        .where(eq(users.lineUserId, textUserId))
        .get(),
    ).toBeUndefined();
  });
});

describe("LINE broadcast API integration", () => {
  it("requires Access for status and internal bearer auth for direct broadcast", async () => {
    const { app, getSendCount } = createTestApp();
    const statusResponse = await app.request(
      "/api/v1/admin/line/broadcasts/daily-quiz",
      {},
      { DB: env.DB },
    );
    expect(statusResponse.status).toBe(401);

    const unauthorized = await app.request(
      "/api/v1/line/broadcasts/daily-quiz",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quizId: "quiz-not-used" }),
      },
      { DB: env.DB, INTERNAL_API_TOKEN: "expected-token" },
    );
    expect(unauthorized.status).toBe(401);
    expect(getSendCount()).toBe(0);

    const id = await seedPublishedQuiz();
    const response = await app.request(
      "/api/v1/line/broadcasts/daily-quiz",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer expected-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ quizId: id }),
      },
      { DB: env.DB, INTERNAL_API_TOKEN: "expected-token" },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      broadcastId: expect.any(String),
      quizDate,
      quizId: id,
      status: "succeeded",
      sentAt: expect.any(String),
    });
    expect(getSendCount()).toBe(1);

    const retried = await app.request(
      "/api/v1/line/broadcasts/daily-quiz",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer expected-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ quizId: id }),
      },
      { DB: env.DB, INTERNAL_API_TOKEN: "expected-token" },
    );
    expect(retried.status).toBe(200);
    expect(getSendCount()).toBe(1);
  });

  it("reuses the LINE Retry Key after an uncertain result and releases the claim on success", async () => {
    const retryDate = "2099-12-29";
    const id = await seedPublishedQuiz(retryDate);
    const repository = new D1LineRepository(env.DB);
    const first = await repository.claimDailyBroadcast(
      claimInput(id, retryDate, "2026-09-25T00:00:00.000Z", "attempt-1"),
    );
    expect(first.status).toBe("claimed");
    if (first.status !== "claimed") return;

    const concurrent = await repository.claimDailyBroadcast(
      claimInput(id, retryDate, "2026-09-25T00:00:30.000Z", "attempt-2"),
    );
    expect(concurrent.status).toBe("in_progress");

    await repository.recordUncertainDailyBroadcast({
      broadcastId: first.broadcastId,
      claimToken: first.claimToken,
      attemptId: first.attempt.id,
    });
    const retry = await repository.claimDailyBroadcast(
      claimInput(id, retryDate, "2026-09-25T00:02:00.000Z", "attempt-3"),
    );
    expect(retry.status).toBe("claimed");
    if (retry.status !== "claimed") return;
    expect(retry.attempt.id).toBe(first.attempt.id);
    expect(retry.attempt.retryKey).toBe(first.attempt.retryKey);

    await repository.completeDailyBroadcast({
      broadcastId: retry.broadcastId,
      claimToken: retry.claimToken,
      attemptId: retry.attempt.id,
      httpStatus: 409,
      requestId: null,
      acceptedRequestId: "line-accepted-request-test",
      finishedAt: "2026-09-25T00:02:01.000Z",
    });
    const completed = await repository.claimDailyBroadcast(
      claimInput(id, retryDate, "2026-09-25T00:03:00.000Z", "attempt-4"),
    );
    expect(completed.status).toBe("succeeded");
    const view = await repository.findDailyBroadcast(retryDate);
    expect(view.broadcastStatus).toBe("succeeded");
  });
});

async function seedPublishedQuiz(date = quizDate): Promise<string> {
  const db = drizzle(env.DB);
  const prefix = `line-broadcast-${crypto.randomUUID()}`;
  const createdAt = `${date}T00:00:00.000Z`;
  const candidateRows = [
    { ageGroup: "10s", genderCode: "male", regionCode: "tokyo" },
    { ageGroup: "20s", genderCode: "female", regionCode: "osaka" },
    { ageGroup: "30s", genderCode: "non_binary", regionCode: "hyogo" },
  ];
  const quizId = `${prefix}-quiz`;
  const participants = candidateRows.map((row, index) => ({
    id: `${prefix}-participant-${index + 1}`,
    userId: `${prefix}-user-${index + 1}`,
    concernId: `${prefix}-concern-${index + 1}`,
    displayOrder: index + 1,
    ageGroupSnapshot: row.ageGroup,
    genderSnapshot: row.genderCode,
    regionCodeSnapshot: row.regionCode,
    explanation: "テスト用の説明",
  }));

  await db.insert(users).values(
    participants.map((participant) => ({
      id: participant.userId,
      lineUserId: `${prefix}-line-${participant.userId}`,
      createdAt,
      updatedAt: createdAt,
    })),
  );
  await db.insert(concerns).values(
    participants.map((participant, index) => ({
      id: participant.concernId,
      userId: participant.userId,
      body: `配信テスト投稿${index + 1}`,
      ageGroup: candidateRows[index].ageGroup,
      genderCode: candidateRows[index].genderCode,
      regionCode: candidateRows[index].regionCode,
      visibilityStatus: "published",
      processingStatus: "pending",
      createdAt,
      updatedAt: createdAt,
    })),
  );
  await db.insert(quizzes).values({
    id: quizId,
    quizDate: date,
    status: "published",
    createdAt,
    publishedAt: createdAt,
  });
  await db
    .insert(quizParticipants)
    .values(participants.map((participant) => ({ quizId, ...participant })));
  await db.insert(quizOptions).values(
    participants.map((participant, index) => ({
      quizId,
      concernId: participant.concernId,
      displayOrder: index + 1,
    })),
  );
  return quizId;
}

function claimInput(
  id: string,
  date: string,
  now: string,
  attemptId: string,
): ClaimDailyBroadcastInput {
  return {
    quizId: id,
    quizDate: date,
    now,
    broadcastId: `broadcast-${crypto.randomUUID()}`,
    claimToken: `claim-${crypto.randomUUID()}`,
    leaseExpiresAt: new Date(Date.parse(now) + 60_000).toISOString(),
    attemptId,
    retryKey: `retry-${crypto.randomUUID()}`,
  };
}

async function signBody(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)),
  );
  let binary = "";
  for (const byte of signature) binary += String.fromCharCode(byte);
  return btoa(binary);
}
