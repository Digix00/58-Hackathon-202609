import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app/create-app";
import { AuthUseCase } from "../src/application/usecase/auth.usecase";
import { HistoryUseCase } from "../src/application/usecase/history.usecase";
import {
  D1SessionRepository,
  D1UserRepository,
} from "../src/infrastructure/database/d1-auth.repository";
import { D1HistoryRepository } from "../src/infrastructure/database/d1-history.repository";
import {
  concernClusters,
  concerns,
  concernViews,
  quizAttempts,
  quizzes,
  users,
} from "../src/infrastructure/database/schema";
import { AuthHandler } from "../src/presentation/auth.handler";
import { HealthHandler } from "../src/presentation/health.handler";
import { HistoryHandler } from "../src/presentation/history.handler";
import { createConcernDependencies } from "./support/concern-fixture";
import { createUserDependencies } from "./support/user-fixture";

const fixedNow = "2099-01-04T00:20:00.000Z";

function createTestApp(lineUserId = `history-user-${crypto.randomUUID()}`) {
  const userRepository = new D1UserRepository(env.DB);
  const authUseCase = new AuthUseCase(
    userRepository,
    new D1SessionRepository(env.DB),
    {
      verify: async (idToken) => {
        if (idToken !== "valid-id-token") throw new Error("unexpected token");
        return { lineUserId };
      },
    },
  );

  const app = createApp({
    ...createConcernDependencies(),
    ...createUserDependencies(),
    authHandler: new AuthHandler(authUseCase),
    authUseCase,
    healthHandler: new HealthHandler({
      execute: async () => ({
        status: "ok",
        checkedAt: fixedNow,
        database: "ok",
        version: "0.1.0",
      }),
    }),
    historyHandler: new HistoryHandler(
      new HistoryUseCase(new D1HistoryRepository(env.DB)),
    ),
  });
  return { app, lineUserId };
}

function cookieFrom(response: Response): string {
  const value = response.headers.get("set-cookie");
  if (!value) throw new Error("session cookie was not set");
  return value.split(";", 1)[0];
}

async function login(
  app: ReturnType<typeof createTestApp>["app"],
): Promise<string> {
  const anonymous = await app.request("/api/v1/auth/session", {}, env);
  const response = await app.request(
    "/api/v1/auth/line",
    {
      method: "POST",
      headers: {
        Cookie: cookieFrom(anonymous),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ idToken: "valid-id-token" }),
    },
    env,
  );
  return cookieFrom(response);
}

async function seedHistory(userId: string) {
  const db = drizzle(env.DB);
  const suffix = crypto.randomUUID();
  const authorId = `history-author-${suffix}`;
  const otherUserId = `history-other-${suffix}`;
  const clusterId = `history-cluster-${suffix}`;
  const createdAt = "2098-01-01T00:00:00.000Z";
  const quizIds = [1, 2, 3].map((number) => `${suffix}-quiz-${number}`);
  const quizDates = ["2098-01-01", "2098-01-02", "2098-01-03"];

  await db.insert(users).values([
    {
      id: authorId,
      lineUserId: `history-author-line-${suffix}`,
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: otherUserId,
      lineUserId: `history-other-line-${suffix}`,
      createdAt,
      updatedAt: createdAt,
    },
  ]);
  await db.insert(concernClusters).values({
    id: clusterId,
    legacyLabel: "old label",
    legacySummary: "old summary",
    label: "仕事と生活",
    summary: "働き方について",
    status: "ready",
    createdAt,
    updatedAt: createdAt,
  });

  const concernIds = [1, 2, 3, 4, 5, 6].map(
    (number) => `${suffix}-concern-${number}`,
  );
  await db.insert(concerns).values([
    {
      id: concernIds[0],
      userId: authorId,
      body: "東京の投稿",
      ageGroup: "20s",
      genderCode: "female",
      regionCode: "tokyo",
      clusterId,
      visibilityStatus: "published",
      processingStatus: "ready",
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: concernIds[1],
      userId: authorId,
      body: "大阪の投稿",
      ageGroup: null,
      genderCode: null,
      regionCode: "osaka",
      clusterId,
      visibilityStatus: "published",
      processingStatus: "ready",
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: concernIds[2],
      userId: authorId,
      body: "非公開の投稿",
      ageGroup: "30s",
      genderCode: "male",
      regionCode: "fukuoka",
      clusterId,
      visibilityStatus: "hidden",
      processingStatus: "ready",
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: concernIds[3],
      userId: authorId,
      body: "未読テーマの投稿",
      ageGroup: null,
      genderCode: null,
      regionCode: "kyoto",
      clusterId,
      visibilityStatus: "published",
      processingStatus: "ready",
      createdAt: "2098-01-08T00:00:00.000Z",
      updatedAt: "2098-01-08T00:00:00.000Z",
    },
    {
      id: concernIds[4],
      userId: authorId,
      body: "未読地域の投稿",
      ageGroup: null,
      genderCode: null,
      regionCode: "hyogo",
      clusterId: null,
      visibilityStatus: "published",
      processingStatus: "pending",
      createdAt: "2098-01-07T00:00:00.000Z",
      updatedAt: "2098-01-07T00:00:00.000Z",
    },
    {
      id: concernIds[5],
      userId,
      body: "本人の未読投稿",
      ageGroup: null,
      genderCode: null,
      regionCode: "aichi",
      clusterId: null,
      visibilityStatus: "published",
      processingStatus: "pending",
      createdAt: "2098-01-09T00:00:00.000Z",
      updatedAt: "2098-01-09T00:00:00.000Z",
    },
  ]);
  await db.insert(concernViews).values([
    {
      concernId: concernIds[0],
      actorKey: userId,
      viewedAt: "2098-01-04T00:00:00.000Z",
    },
    {
      concernId: concernIds[1],
      actorKey: userId,
      viewedAt: "2098-01-05T00:00:00.000Z",
    },
    {
      concernId: concernIds[2],
      actorKey: userId,
      viewedAt: "2098-01-06T00:00:00.000Z",
    },
    {
      concernId: concernIds[0],
      actorKey: otherUserId,
      viewedAt: "2098-01-07T00:00:00.000Z",
    },
  ]);

  await db.insert(quizzes).values(
    quizIds.map((id, index) => ({
      id,
      quizDate: quizDates[index],
      status: "published" as const,
      createdAt,
      publishedAt: createdAt,
    })),
  );
  await db.insert(quizAttempts).values([
    {
      id: `${suffix}-attempt-1`,
      quizId: quizIds[0],
      userId,
      score: 3,
      answeredAt: "2098-01-08T00:00:00.000Z",
    },
    {
      id: `${suffix}-attempt-2`,
      quizId: quizIds[1],
      userId,
      score: 2,
      answeredAt: "2098-01-09T00:00:00.000Z",
    },
    {
      id: `${suffix}-attempt-3`,
      quizId: quizIds[2],
      userId,
      score: 1,
      answeredAt: "2098-01-10T00:00:00.000Z",
    },
    {
      id: `${suffix}-other-attempt`,
      quizId: quizIds[2],
      userId: otherUserId,
      score: 0,
      answeredAt: "2098-01-11T00:00:00.000Z",
    },
  ]);

  return {
    concernIds,
    otherUserId,
    quizIds,
    unreadThemeConcernId: concernIds[3],
    unreadRegionConcernId: concernIds[4],
  };
}

describe("learning history routes", () => {
  it("aggregates only the current user's public views and paginates their quiz attempts", async () => {
    const { app, lineUserId } = createTestApp();
    const cookie = await login(app);
    const db = drizzle(env.DB);
    const user = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.lineUserId, lineUserId))
      .get();
    if (!user) throw new Error("authenticated user was not created");
    const seeded = await seedHistory(user.id);

    const summaryResponse = await app.request(
      "/api/v1/history/summary",
      { headers: { Cookie: cookie } },
      env,
    );
    expect(summaryResponse.status).toBe(200);
    const summary = await summaryResponse.json<{
      viewedConcernCount: number;
      nextSuggestion:
        | { kind: "theme"; label: string }
        | { kind: "region"; regionCode: string }
        | null;
      clusters: Array<{ clusterId: string; label: string; count: number }>;
      regions: Array<{ regionCode: string; count: number }>;
      attributes: {
        ageGroups: Array<{ ageGroup: string; count: number }>;
        genders: Array<{ gender: string; count: number }>;
      };
      quiz: {
        answeredCount: number;
        correctCount: number;
        totalQuestions: number;
        accuracy: number;
      };
    }>();
    expect(summary).toMatchObject({
      viewedConcernCount: 2,
      nextSuggestion: { kind: "theme", label: "仕事と生活" },
      clusters: [{ label: "仕事と生活", count: 2 }],
      regions: [
        { regionCode: "osaka", count: 1 },
        { regionCode: "tokyo", count: 1 },
      ],
      attributes: {
        ageGroups: [{ ageGroup: "20s", count: 1 }],
        genders: [{ gender: "female", count: 1 }],
      },
      quiz: {
        answeredCount: 3,
        correctCount: 6,
        totalQuestions: 9,
        accuracy: 0.6667,
      },
    });

    await db.insert(concernViews).values({
      concernId: seeded.unreadThemeConcernId,
      actorKey: user.id,
      viewedAt: "2098-01-12T00:00:00.000Z",
    });
    const regionSuggestionResponse = await app.request(
      "/api/v1/history/summary",
      { headers: { Cookie: cookie } },
      env,
    );
    const regionSuggestion = await regionSuggestionResponse.json<{
      nextSuggestion:
        | { kind: "theme"; label: string }
        | { kind: "region"; regionCode: string }
        | null;
    }>();
    expect(regionSuggestion.nextSuggestion).toEqual({
      kind: "region",
      regionCode: "hyogo",
    });

    await db.insert(concernViews).values({
      concernId: seeded.unreadRegionConcernId,
      actorKey: user.id,
      viewedAt: "2098-01-13T00:00:00.000Z",
    });
    await env.DB.prepare(
      "INSERT INTO concern_views (concern_id, actor_key, viewed_at) " +
        "SELECT id, ?, '2098-01-14T00:00:00.000Z' FROM concerns " +
        "WHERE visibility_status = 'published' AND user_id <> ? " +
        "ON CONFLICT DO NOTHING",
    )
      .bind(user.id, user.id)
      .run();
    const completeSummaryResponse = await app.request(
      "/api/v1/history/summary",
      { headers: { Cookie: cookie } },
      env,
    );
    const completeSummary = await completeSummaryResponse.json<{
      nextSuggestion: unknown;
    }>();
    expect(completeSummary.nextSuggestion).toBeNull();

    const firstPageResponse = await app.request(
      "/api/v1/history/quiz-answers?limit=2",
      { headers: { Cookie: cookie } },
      env,
    );
    expect(firstPageResponse.status).toBe(200);
    const firstPage = await firstPageResponse.json<{
      items: Array<{
        quizId: string;
        quizDate: string;
        score: number;
        total: number;
      }>;
      nextCursor: string | null;
    }>();
    expect(firstPage.items.map((item) => item.quizId)).toEqual([
      seeded.quizIds[2],
      seeded.quizIds[1],
    ]);
    expect(firstPage.items.every((item) => item.total === 3)).toBe(true);
    expect(firstPage.nextCursor).toBeTruthy();
    expect(JSON.stringify(firstPage)).not.toContain(user.id);
    expect(JSON.stringify(firstPage)).not.toContain(seeded.otherUserId);

    const secondPageResponse = await app.request(
      `/api/v1/history/quiz-answers?limit=2&cursor=${encodeURIComponent(firstPage.nextCursor ?? "")}`,
      { headers: { Cookie: cookie } },
      env,
    );
    expect(secondPageResponse.status).toBe(200);
    const secondPage = await secondPageResponse.json<{
      items: Array<{ quizId: string }>;
      nextCursor: string | null;
    }>();
    expect(secondPage).toEqual({
      items: [
        {
          quizId: seeded.quizIds[0],
          quizDate: "2098-01-01",
          score: 3,
          total: 3,
          answeredAt: "2098-01-08T00:00:00.000Z",
        },
      ],
      nextCursor: null,
    });
  });

  it("requires LINE authentication and validates pagination input", async () => {
    const { app } = createTestApp();
    const unauthenticated = await app.request(
      "/api/v1/history/summary",
      {},
      env,
    );
    expect(unauthenticated.status).toBe(401);

    const cookie = await login(app);
    const invalidLimit = await app.request(
      "/api/v1/history/quiz-answers?limit=0",
      { headers: { Cookie: cookie } },
      env,
    );
    expect(invalidLimit.status).toBe(400);
    const invalidCursor = await app.request(
      "/api/v1/history/quiz-answers?cursor=not-a-cursor",
      { headers: { Cookie: cookie } },
      env,
    );
    expect(invalidCursor.status).toBe(400);
    expect(await invalidCursor.json()).toMatchObject({
      error: { code: "INVALID_CURSOR" },
    });
  });

  it("blocks both history routes for a deleted user", async () => {
    const { app, lineUserId } = createTestApp();
    const cookie = await login(app);
    const db = drizzle(env.DB);
    await db
      .update(users)
      .set({ deletedAt: "2098-01-01T00:00:00.000Z" })
      .where(eq(users.lineUserId, lineUserId));

    for (const path of [
      "/api/v1/history/summary",
      "/api/v1/history/quiz-answers",
    ]) {
      const response = await app.request(
        path,
        { headers: { Cookie: cookie } },
        env,
      );
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({
        error: { code: "USER_DELETED" },
      });
    }
  });
});
