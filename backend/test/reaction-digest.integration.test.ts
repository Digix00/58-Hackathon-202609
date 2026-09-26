import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import { beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app/create-app";
import type { LinePushResult } from "../src/application/port/line-push-sender";
import { LineUseCase } from "../src/application/usecase/line.usecase";
import { ReactionDigestUseCase } from "../src/application/usecase/reaction-digest.usecase";
import { createApplication } from "../src/bootstrap/container";
import { D1LineRepository } from "../src/infrastructure/database/d1-line.repository";
import { D1ReactionDigestRepository } from "../src/infrastructure/database/d1-reaction-digest.repository";
import {
  concernReactions,
  concerns,
  users,
} from "../src/infrastructure/database/schema";
import { HmacLineSignatureVerifier } from "../src/infrastructure/line/hmac-line-signature.verifier";
import { HealthHandler } from "../src/presentation/health.handler";
import { LineHandler } from "../src/presentation/line.handler";
import { ReactionDigestHandler } from "../src/presentation/reaction-digest.handler";
import { createAuthDependencies } from "./support/auth-fixture";
import { createConcernDependencies } from "./support/concern-fixture";
import { createHistoryDependencies } from "./support/history-fixture";
import { createSpeechDependencies } from "./support/speech-fixture";
import { createUserDependencies } from "./support/user-fixture";

const liffId = "1234567890-AbcdEfgh";
const db = drizzle(env.DB);

interface SentMessage {
  lineUserId: string;
  text: string;
  retryKey: string;
}

type PushBehavior = (lineUserId: string) => LinePushResult;

const accepted: LinePushResult = {
  status: "accepted",
  httpStatus: 200,
  requestId: "line-request-test",
  acceptedRequestId: null,
};

function createDigest(
  options: {
    now?: () => Date;
    maxPerRun?: number;
    behavior?: PushBehavior;
  } = {},
) {
  const sent: SentMessage[] = [];
  let behavior: PushBehavior = options.behavior ?? (() => accepted);
  const useCase = new ReactionDigestUseCase(
    new D1ReactionDigestRepository(env.DB),
    {
      deliveryMode: "line_api",
      isConfigured: () => true,
      sendText: async (lineUserId, text, retryKey) => {
        sent.push({ lineUserId, text, retryKey });
        return behavior(lineUserId);
      },
    },
    liffId,
    { maxPerRun: options.maxPerRun },
    options.now,
  );
  return {
    useCase,
    sent,
    setBehavior: (next: PushBehavior) => {
      behavior = next;
    },
  };
}

async function seedUser(
  options: {
    regionCode?: string | null;
    friendStatus?: string | null;
    displayLanguage?: string;
  } = {},
) {
  const id = crypto.randomUUID();
  const lineUserId = `line-${id}`;
  await db
    .insert(users)
    .values({
      id,
      lineUserId,
      displayLanguage: options.displayLanguage ?? "original",
      regionCode: options.regionCode ?? null,
      friendStatus:
        options.friendStatus === undefined ? "active" : options.friendStatus,
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    })
    .run();
  return { id, lineUserId };
}

async function seedConcern(userId: string, visibilityStatus = "published") {
  const id = crypto.randomUUID();
  await db
    .insert(concerns)
    .values({
      id,
      userId,
      body: "テスト用の悩み",
      visibilityStatus,
      processingStatus: "ready",
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    })
    .run();
  return id;
}

async function react(concernId: string, userId: string, createdAt: string) {
  await db
    .insert(concernReactions)
    .values({ concernId, userId, reactionType: "empathy", createdAt })
    .run();
}

beforeEach(async () => {
  // 他のテストのユーザーを配信対象から外し、このファイルのテストを互いに独立させる。
  await env.DB.batch([
    env.DB.prepare("delete from reaction_digest_deliveries"),
    env.DB.prepare("delete from reaction_digest_runs"),
    env.DB.prepare("update users set friend_status = null"),
  ]);
});

describe("ReactionDigestUseCase", () => {
  it("counts distinct reactors since the last notification and describes regions", async () => {
    const recipient = await seedUser({ regionCode: "hokkaido" });
    const sameRegion = await seedUser({ regionCode: "hokkaido" });
    const otherRegion = await seedUser({ regionCode: "tokyo" });
    const noRegion = await seedUser({ regionCode: null });
    const concernId = await seedConcern(recipient.id);
    const secondConcernId = await seedConcern(recipient.id);
    const hiddenConcernId = await seedConcern(recipient.id, "hidden");
    await react(concernId, sameRegion.id, "2026-09-26T01:00:00.000Z");
    await react(secondConcernId, sameRegion.id, "2026-09-26T01:00:00.000Z");
    await react(concernId, otherRegion.id, "2026-09-26T02:00:00.000Z");
    await react(concernId, noRegion.id, "2026-09-26T03:00:00.000Z");
    // 自分の寄りそい、非公開投稿への寄りそい、締め時刻より後の寄りそいは数えない。
    await react(concernId, recipient.id, "2026-09-26T03:00:00.000Z");
    await react(hiddenConcernId, otherRegion.id, "2026-09-26T03:00:00.000Z");
    await react(secondConcernId, otherRegion.id, "2026-09-26T12:00:00.000Z");

    const { useCase, sent } = createDigest({
      now: () => new Date("2026-09-26T11:00:00.000Z"),
    });
    const result = await useCase.runManual();

    expect(result.status).toBe("finished");
    expect(result.run).toMatchObject({
      status: "succeeded",
      targetCount: 1,
      sentCount: 1,
      remainingCount: 0,
    });
    expect(sent).toHaveLength(1);
    expect(sent[0].lineUserId).toBe(recipient.lineUserId);
    expect(sent[0].text).toBe(
      [
        "あなたの悩みに、3人がそっと寄りそいました。",
        "そのうち1人は、あなたと同じ北海道の人です。",
        "全国2つの都道府県から届いています。",
        "",
        "▼ みんなの悩みを見てみる",
        `https://liff.line.me/${liffId}/`,
      ].join("\n"),
    );
  });

  it("does not notify again until new reactions arrive after the last success", async () => {
    const recipient = await seedUser();
    const reactor = await seedUser();
    const lateReactor = await seedUser();
    const concernId = await seedConcern(recipient.id);
    await react(concernId, reactor.id, "2026-09-26T01:00:00.000Z");

    let now = new Date("2026-09-26T11:00:00.000Z");
    const { useCase, sent } = createDigest({ now: () => now });
    await useCase.runManual();
    expect(sent).toHaveLength(1);

    now = new Date("2026-09-26T12:00:00.000Z");
    const nothingNew = await useCase.runManual();
    expect(nothingNew.run).toMatchObject({
      status: "succeeded",
      targetCount: 0,
    });
    expect(sent).toHaveLength(1);

    await react(concernId, lateReactor.id, "2026-09-26T12:30:00.000Z");
    now = new Date("2026-09-26T13:00:00.000Z");
    await useCase.runManual();
    expect(sent).toHaveLength(2);
    expect(sent[1].text).toContain("1人がそっと寄りそいました。");
  });

  it("recounts from the last success after a rejected push", async () => {
    const recipient = await seedUser();
    const first = await seedUser();
    const second = await seedUser();
    const concernId = await seedConcern(recipient.id);
    await react(concernId, first.id, "2026-09-26T01:00:00.000Z");

    let now = new Date("2026-09-26T11:00:00.000Z");
    const { useCase, sent, setBehavior } = createDigest({
      now: () => now,
      behavior: () => ({
        status: "rejected",
        httpStatus: 500,
        requestId: null,
        acceptedRequestId: null,
      }),
    });
    const failed = await useCase.runManual();
    expect(failed.run).toMatchObject({ status: "failed", failedCount: 1 });

    await react(concernId, second.id, "2026-09-26T11:30:00.000Z");
    setBehavior(() => accepted);
    now = new Date("2026-09-26T12:00:00.000Z");
    const retried = await useCase.runManual();
    expect(retried.run.status).toBe("succeeded");
    expect(sent).toHaveLength(2);
    expect(sent[1].text).toContain("2人がそっと寄りそいました。");
  });

  it("keeps an uncertain push pending and resends it with the same retry key", async () => {
    const recipient = await seedUser();
    const reactor = await seedUser();
    await react(
      await seedConcern(recipient.id),
      reactor.id,
      "2026-09-26T01:00:00.000Z",
    );

    const { useCase, sent, setBehavior } = createDigest({
      now: () => new Date("2026-09-26T11:00:00.000Z"),
      behavior: () => ({ status: "unknown" }),
    });
    const uncertain = await useCase.runManual();
    expect(uncertain.status).toBe("pending");
    expect(uncertain.run).toMatchObject({
      status: "pending",
      remainingCount: 1,
    });

    setBehavior(() => ({
      status: "accepted",
      httpStatus: 409,
      requestId: null,
      acceptedRequestId: "line-accepted-request-test",
    }));
    const resumed = await useCase.runManual();
    expect(resumed.run.runId).toBe(uncertain.run.runId);
    expect(resumed.run).toMatchObject({ status: "succeeded", sentCount: 1 });
    expect(sent).toHaveLength(2);
    expect(sent[1].retryKey).toBe(sent[0].retryKey);
  });

  it("sends at most maxPerRun deliveries and continues in the next run", async () => {
    const reactor = await seedUser();
    for (let index = 0; index < 3; index += 1) {
      const recipient = await seedUser();
      await react(
        await seedConcern(recipient.id),
        reactor.id,
        "2026-09-26T01:00:00.000Z",
      );
    }

    const { useCase, sent } = createDigest({
      now: () => new Date("2026-09-26T11:00:00.000Z"),
      maxPerRun: 2,
    });
    const partial = await useCase.runManual();
    expect(partial.status).toBe("pending");
    expect(partial.run).toMatchObject({
      targetCount: 3,
      sentCount: 2,
      remainingCount: 1,
    });

    const completed = await useCase.runManual();
    expect(completed.run.runId).toBe(partial.run.runId);
    expect(completed.run).toMatchObject({
      status: "succeeded",
      sentCount: 3,
      remainingCount: 0,
    });
    expect(new Set(sent.map((message) => message.lineUserId)).size).toBe(3);
  });

  it("runs the scheduled digest only once per Tokyo date", async () => {
    const recipient = await seedUser();
    const reactor = await seedUser();
    const concernId = await seedConcern(recipient.id);
    await react(concernId, reactor.id, "2026-09-26T01:00:00.000Z");

    const { useCase, sent } = createDigest({
      now: () => new Date("2026-09-26T11:00:00.000Z"),
    });
    const scheduledAt = new Date("2026-09-26T11:00:00.000Z");
    const first = await useCase.runScheduled(scheduledAt);
    await react(concernId, (await seedUser()).id, "2026-09-26T10:00:00.000Z");
    const second = await useCase.runScheduled(scheduledAt);

    expect(first.run.trigger).toBe("cron");
    expect(second.status).toBe("finished");
    expect(second.run.runId).toBe(first.run.runId);
    expect(sent).toHaveLength(1);
  });

  it("skips recipients who unfollowed or never became friends", async () => {
    const unfollowed = await seedUser({ friendStatus: "unfollowed" });
    const notFriend = await seedUser({ friendStatus: null });
    const reactor = await seedUser();
    await react(
      await seedConcern(unfollowed.id),
      reactor.id,
      "2026-09-26T01:00:00.000Z",
    );
    await react(
      await seedConcern(notFriend.id),
      reactor.id,
      "2026-09-26T01:00:00.000Z",
    );

    const { useCase, sent } = createDigest({
      now: () => new Date("2026-09-26T11:00:00.000Z"),
    });
    const result = await useCase.runManual();
    expect(result.run.targetCount).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it("uses the recipient's display language", async () => {
    const recipient = await seedUser({
      regionCode: "osaka",
      displayLanguage: "en",
    });
    const reactor = await seedUser({ regionCode: "osaka" });
    await react(
      await seedConcern(recipient.id),
      reactor.id,
      "2026-09-26T01:00:00.000Z",
    );

    const { useCase, sent } = createDigest({
      now: () => new Date("2026-09-26T11:00:00.000Z"),
    });
    await useCase.runManual();
    expect(sent[0].text).toBe(
      [
        "1 person gently stood by your concern.",
        "1 of them is from Osaka, just like you.",
        "",
        "▼ See everyone's concerns",
        `https://liff.line.me/${liffId}/`,
      ].join("\n"),
    );
  });
});

describe("reaction digest API", () => {
  function createTestApp() {
    const digest = createDigest({
      now: () => new Date("2026-09-26T11:00:00.000Z"),
    });
    const lineUseCase = new LineUseCase(
      new D1LineRepository(env.DB),
      new HmacLineSignatureVerifier("unit-test-channel-secret"),
      {
        deliveryMode: "line_api",
        isConfigured: () => true,
        sendDailyQuiz: async () => accepted,
      },
      { ensureDailyQuiz: async () => null },
      liffId,
    );
    const app = createApp({
      ...createAuthDependencies(),
      ...createConcernDependencies(),
      ...createHistoryDependencies(),
      ...createSpeechDependencies(),
      ...createUserDependencies(),
      healthHandler: new HealthHandler({
        execute: async () => ({
          status: "ok",
          checkedAt: "2026-09-26T11:00:00.000Z",
          database: "ok",
          version: "test",
        }),
      }),
      lineHandler: new LineHandler(lineUseCase),
      reactionDigestHandler: new ReactionDigestHandler(digest.useCase),
    });
    return { app, sent: digest.sent };
  }

  const devAccess = {
    DB: env.DB,
    DEV_AUTH_ENABLED: "true",
    DEV_ACCESS_BYPASS: "true",
    CORS_ORIGIN: "http://localhost:5173",
  };

  it("protects the admin and internal endpoints", async () => {
    const { app, sent } = createTestApp();
    const status = await app.request(
      "/api/v1/admin/line/notifications/reaction-digest",
      {},
      { DB: env.DB },
    );
    expect(status.status).toBe(401);

    const unauthorized = await app.request(
      "/api/v1/line/notifications/reaction-digest",
      { method: "POST" },
      { DB: env.DB, INTERNAL_API_TOKEN: "expected-token" },
    );
    expect(unauthorized.status).toBe(401);

    const wrongOrigin = await app.request(
      "/api/v1/admin/line/notifications/reaction-digest",
      { method: "POST", headers: { Origin: "https://evil.example" } },
      devAccess,
    );
    expect(wrongOrigin.status).toBe(403);
    expect(sent).toHaveLength(0);
  });

  it("runs from the admin screen and lists recent runs", async () => {
    const { app, sent } = createTestApp();
    const recipient = await seedUser();
    const reactor = await seedUser();
    await react(
      await seedConcern(recipient.id),
      reactor.id,
      "2026-09-26T01:00:00.000Z",
    );

    const triggered = await app.request(
      "/api/v1/admin/line/notifications/reaction-digest",
      { method: "POST", headers: { Origin: "http://localhost:5173" } },
      devAccess,
    );
    expect(triggered.status).toBe(200);
    expect(await triggered.json()).toMatchObject({
      deliveryMode: "line_api",
      run: { trigger: "manual", status: "succeeded", sentCount: 1 },
    });
    expect(sent).toHaveLength(1);

    const status = await app.request(
      "/api/v1/admin/line/notifications/reaction-digest",
      {},
      devAccess,
    );
    expect(status.status).toBe(200);
    const body = await status.json();
    expect(body).toMatchObject({
      deliveryMode: "line_api",
      runs: [{ trigger: "manual", status: "succeeded", targetCount: 1 }],
    });
    // 受信者の LINE user ID や個人の集計値は返さない。
    expect(JSON.stringify(body)).not.toContain(recipient.lineUserId);
  });

  it("returns 409 while another runner holds the run", async () => {
    const { app, sent } = createTestApp();
    await env.DB.prepare(
      `insert into reaction_digest_runs
         (id, trigger, idempotency_key, status, cutoff_at, claim_token, lease_expires_at, requested_at)
       values ('running-run', 'manual', 'reaction-digest:manual:running-run', 'running',
         '2026-09-26T10:59:00.000Z', 'other-runner', '2099-01-01T00:00:00.000Z', '2026-09-26T10:59:00.000Z')`,
    ).run();

    const response = await app.request(
      "/api/v1/line/notifications/reaction-digest",
      {
        method: "POST",
        headers: { Authorization: "Bearer expected-token" },
      },
      { DB: env.DB, INTERNAL_API_TOKEN: "expected-token" },
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { code: "REACTION_DIGEST_IN_PROGRESS" },
    });
    expect(sent).toHaveLength(0);
  });
});

describe("reaction digest configuration", () => {
  const simulationBindings = {
    ...env,
    DEV_AUTH_ENABLED: "true",
    DEV_ACCESS_BYPASS: "true",
    DEV_LINE_BROADCAST_SIMULATION: "true",
    INTERNAL_API_TOKEN: "expected-token",
    LINE_LIFF_ID: liffId,
  };

  it("limits one run to REACTION_DIGEST_MAX_PER_RUN deliveries from the binding", async () => {
    const reactor = await seedUser();
    for (let index = 0; index < 3; index += 1) {
      const recipient = await seedUser();
      await react(
        await seedConcern(recipient.id),
        reactor.id,
        "2026-09-26T01:00:00.000Z",
      );
    }

    const bindings = {
      ...simulationBindings,
      REACTION_DIGEST_MAX_PER_RUN: "2",
    };
    const application = createApplication(bindings);
    const response = await application.app.request(
      "/api/v1/line/notifications/reaction-digest",
      {
        method: "POST",
        headers: { Authorization: "Bearer expected-token" },
      },
      bindings,
    );

    // 上限が既定の 40 のままなら 3 件すべて送られ、200 になる。
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({
      deliveryMode: "simulation",
      run: {
        status: "pending",
        targetCount: 3,
        sentCount: 2,
        remainingCount: 1,
      },
    });
  });

  it("rejects a REACTION_DIGEST_MAX_PER_RUN binding that is not a positive integer", () => {
    for (const value of ["0", "-1", "1.5", "many"]) {
      expect(() =>
        createApplication({
          ...simulationBindings,
          REACTION_DIGEST_MAX_PER_RUN: value,
        }),
      ).toThrow(TypeError);
    }
  });

  it("falls back to the default limit when the binding is absent or blank", () => {
    for (const value of [undefined, "", "  "]) {
      expect(() =>
        createApplication({
          ...simulationBindings,
          REACTION_DIGEST_MAX_PER_RUN: value,
        }),
      ).not.toThrow();
    }
  });

  it("rejects an invalid maxPerRun option", () => {
    expect(() => createDigest({ maxPerRun: 0 })).toThrow(RangeError);
    expect(() => createDigest({ maxPerRun: 2.5 })).toThrow(RangeError);
  });
});
