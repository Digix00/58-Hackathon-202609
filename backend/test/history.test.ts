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
  concernReactions,
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
import { createSpeechDependencies } from "./support/speech-fixture";
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
    ...createSpeechDependencies(),
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
  const unreadThemeClusterId = `history-unread-theme-cluster-${suffix}`;
  const failedViewedClusterId = `history-failed-viewed-cluster-${suffix}`;
  const failedCandidateClusterId = `history-failed-candidate-cluster-${suffix}`;
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
  await db.insert(concernClusters).values([
    {
      id: clusterId,
      legacyLabel: "old label",
      legacySummary: "old summary",
      label: "仕事と生活",
      summary: "働き方について",
      status: "ready",
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: unreadThemeClusterId,
      legacyLabel: "old unread label",
      legacySummary: "old unread summary",
      label: "まだ出会っていないテーマ",
      summary: "未読テーマについて",
      status: "ready",
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: failedViewedClusterId,
      legacyLabel: "old failed label",
      legacySummary: "old failed summary",
      label: "処理失敗済みのテーマ",
      summary: "処理失敗した投稿のテーマ",
      status: "ready",
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: failedCandidateClusterId,
      legacyLabel: "old pending label",
      legacySummary: "old pending summary",
      label: "処理未完了の候補テーマ",
      summary: "処理未完了投稿のテーマ",
      status: "ready",
      createdAt,
      updatedAt: createdAt,
    },
  ]);

  const concernIds = Array.from(
    { length: 11 },
    (_, index) => `${suffix}-concern-${index + 1}`,
  );
  const concernRows = [
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
      clusterId: unreadThemeClusterId,
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
    {
      id: concernIds[6],
      userId: authorId,
      body: "既読テーマの未読投稿",
      ageGroup: null,
      genderCode: null,
      regionCode: "osaka",
      clusterId,
      visibilityStatus: "published",
      processingStatus: "ready",
      createdAt: "2098-01-13T00:00:00.000Z",
      updatedAt: "2098-01-13T00:00:00.000Z",
    },
    {
      id: concernIds[7],
      userId: authorId,
      body: "処理に失敗した既読投稿",
      ageGroup: null,
      genderCode: null,
      regionCode: "shizuoka",
      clusterId: failedViewedClusterId,
      visibilityStatus: "published",
      processingStatus: "failed",
      createdAt: "2098-01-03T00:00:00.000Z",
      updatedAt: "2098-01-03T00:00:00.000Z",
    },
    {
      id: concernIds[8],
      userId: authorId,
      body: "処理に失敗した未読投稿",
      ageGroup: null,
      genderCode: null,
      regionCode: null,
      clusterId: failedCandidateClusterId,
      visibilityStatus: "published",
      processingStatus: "failed",
      createdAt: "2098-01-14T00:00:00.000Z",
      updatedAt: "2098-01-14T00:00:00.000Z",
    },
    {
      id: concernIds[9],
      userId: authorId,
      body: "同じ未読テーマの別投稿",
      ageGroup: null,
      genderCode: null,
      regionCode: "kyoto",
      clusterId: unreadThemeClusterId,
      visibilityStatus: "published",
      processingStatus: "ready",
      createdAt: "2098-01-11T00:00:00.000Z",
      updatedAt: "2098-01-11T00:00:00.000Z",
    },
    {
      id: concernIds[10],
      userId: authorId,
      body: "既読地域の未読投稿",
      ageGroup: null,
      genderCode: null,
      regionCode: "osaka",
      clusterId: null,
      visibilityStatus: "published",
      processingStatus: "pending",
      createdAt: "2098-01-15T00:00:00.000Z",
      updatedAt: "2098-01-15T00:00:00.000Z",
    },
  ];
  for (let index = 0; index < concernRows.length; index += 5) {
    await db.insert(concerns).values(concernRows.slice(index, index + 5));
  }
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
      concernId: concernIds[7],
      actorKey: userId,
      viewedAt: "2098-01-03T00:00:00.000Z",
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

/** 自分が書いた声と、寄りそった声の履歴だけを確認するための最小データ。 */
async function seedConcernHistory(userId: string) {
  const db = drizzle(env.DB);
  const suffix = crypto.randomUUID();
  const authorId = `own-author-${suffix}`;
  const otherUserId = `own-other-${suffix}`;
  const clusterId = `own-cluster-${suffix}`;
  const createdAt = "2098-02-01T00:00:00.000Z";

  await db.insert(users).values([
    {
      id: authorId,
      lineUserId: `own-author-line-${suffix}`,
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: otherUserId,
      lineUserId: `own-other-line-${suffix}`,
      createdAt,
      updatedAt: createdAt,
    },
  ]);
  await db.insert(concernClusters).values({
    id: clusterId,
    legacyLabel: "old label",
    legacySummary: "old summary",
    label: "眠れない夜",
    summary: "夜の過ごし方について",
    status: "ready",
    createdAt,
    updatedAt: createdAt,
  });

  const ownIds = {
    published: `${suffix}-own-published`,
    pending: `${suffix}-own-pending`,
    hidden: `${suffix}-own-hidden`,
    deleted: `${suffix}-own-deleted`,
  };
  const supportedIds = {
    first: `${suffix}-supported-1`,
    second: `${suffix}-supported-2`,
    third: `${suffix}-supported-3`,
    hidden: `${suffix}-supported-hidden`,
  };

  await db.insert(concerns).values([
    {
      id: ownIds.published,
      userId,
      body: "自分で書いた公開中の声",
      ageGroup: "20s",
      genderCode: "female",
      regionCode: "osaka",
      clusterId,
      visibilityStatus: "published",
      processingStatus: "ready",
      createdAt: "2098-02-03T00:00:00.000Z",
      updatedAt: "2098-02-03T00:00:00.000Z",
    },
    {
      id: ownIds.pending,
      userId,
      body: "自分で書いた準備中の声",
      visibilityStatus: "published",
      processingStatus: "pending",
      createdAt: "2098-02-02T00:00:00.000Z",
      updatedAt: "2098-02-02T00:00:00.000Z",
    },
    {
      id: ownIds.hidden,
      userId,
      body: "自分で書いた非公開の声",
      visibilityStatus: "hidden",
      processingStatus: "ready",
      createdAt: "2098-02-01T00:00:00.000Z",
      updatedAt: "2098-02-01T00:00:00.000Z",
    },
    {
      id: ownIds.deleted,
      userId,
      body: "自分で消した声",
      visibilityStatus: "deleted",
      processingStatus: "ready",
      createdAt: "2098-02-04T00:00:00.000Z",
      updatedAt: "2098-02-04T00:00:00.000Z",
    },
  ]);
  await db.insert(concerns).values([
    {
      id: supportedIds.first,
      userId: authorId,
      body: "寄りそった声その1",
      regionCode: "tokyo",
      visibilityStatus: "published",
      processingStatus: "ready",
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: supportedIds.second,
      userId: authorId,
      body: "寄りそった声その2",
      visibilityStatus: "published",
      processingStatus: "ready",
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: supportedIds.third,
      userId: authorId,
      body: "寄りそった声その3",
      visibilityStatus: "published",
      processingStatus: "ready",
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: supportedIds.hidden,
      userId: authorId,
      body: "非公開になった声",
      visibilityStatus: "hidden",
      processingStatus: "ready",
      createdAt,
      updatedAt: createdAt,
    },
  ]);

  await db.insert(concernReactions).values([
    {
      concernId: supportedIds.first,
      userId,
      reactionType: "empathy",
      createdAt: "2098-02-05T00:00:00.000Z",
    },
    {
      concernId: supportedIds.second,
      userId,
      reactionType: "empathy",
      createdAt: "2098-02-06T00:00:00.000Z",
    },
    {
      concernId: supportedIds.third,
      userId,
      reactionType: "empathy",
      createdAt: "2098-02-07T00:00:00.000Z",
    },
    {
      concernId: supportedIds.hidden,
      userId,
      reactionType: "empathy",
      createdAt: "2098-02-08T00:00:00.000Z",
    },
    {
      concernId: ownIds.published,
      userId: otherUserId,
      reactionType: "empathy",
      createdAt: "2098-02-09T00:00:00.000Z",
    },
  ]);

  return { authorId, otherUserId, ownIds, supportedIds };
}

interface ConcernHistoryPageResponse {
  items: Array<{
    id: string;
    body: string;
    attributes: { regionName?: string };
    cluster: { label: string | null } | null;
    reactionCount: number;
    visibilityStatus: string;
    processingStatus: string;
    reactedAt: string | null;
    createdAt: string;
  }>;
  nextCursor: string | null;
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
      viewedConcernCount: 3,
      nextSuggestion: { kind: "theme", label: "まだ出会っていないテーマ" },
      clusters: [{ label: "仕事と生活", count: 2 }],
      regions: [
        { regionCode: "osaka", regionName: "大阪府", count: 1 },
        { regionCode: "shizuoka", regionName: "静岡県", count: 1 },
        { regionCode: "tokyo", regionName: "東京都", count: 1 },
      ],
      attributes: {
        ageGroups: [{ ageGroup: "20s", ageGroupName: "20代", count: 1 }],
        genders: [{ gender: "female", genderName: "女性", count: 1 }],
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
      regionName: "兵庫県",
    });

    const englishSummaryResponse = await app.request(
      "/api/v1/history/summary?language=en",
      { headers: { Cookie: cookie } },
      env,
    );
    expect(englishSummaryResponse.status).toBe(200);
    expect(await englishSummaryResponse.json()).toMatchObject({
      nextSuggestion: {
        kind: "region",
        regionCode: "hyogo",
        regionName: "Hyogo",
      },
      regions: expect.arrayContaining([
        { regionCode: "osaka", regionName: "Osaka", count: 1 },
      ]),
      attributes: {
        ageGroups: [{ ageGroup: "20s", ageGroupName: "20s", count: 1 }],
        genders: [{ gender: "female", genderName: "Female", count: 1 }],
      },
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

  it("lists the user's own voices and the voices they supported", async () => {
    const { app, lineUserId } = createTestApp();
    const cookie = await login(app);
    const db = drizzle(env.DB);
    const user = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.lineUserId, lineUserId))
      .get();
    if (!user) throw new Error("authenticated user was not created");
    const seeded = await seedConcernHistory(user.id);

    const ownFirstResponse = await app.request(
      "/api/v1/history/concerns?limit=2",
      { headers: { Cookie: cookie } },
      env,
    );
    expect(ownFirstResponse.status).toBe(200);
    const ownFirstPage =
      await ownFirstResponse.json<ConcernHistoryPageResponse>();
    expect(ownFirstPage.items.map((item) => item.id)).toEqual([
      seeded.ownIds.published,
      seeded.ownIds.pending,
    ]);
    expect(ownFirstPage.items[0]).toMatchObject({
      body: "自分で書いた公開中の声",
      attributes: { regionName: "大阪府" },
      cluster: { label: "眠れない夜" },
      reactionCount: 1,
      visibilityStatus: "published",
      processingStatus: "ready",
      reactedAt: null,
    });
    // 準備中の投稿はテーマがまだないため、しおりを出さない。
    expect(ownFirstPage.items[1].cluster).toBeNull();
    expect(ownFirstPage.nextCursor).toBeTruthy();
    expect(JSON.stringify(ownFirstPage)).not.toContain(user.id);

    const ownSecondResponse = await app.request(
      `/api/v1/history/concerns?limit=2&cursor=${encodeURIComponent(ownFirstPage.nextCursor ?? "")}`,
      { headers: { Cookie: cookie } },
      env,
    );
    const ownSecondPage =
      await ownSecondResponse.json<ConcernHistoryPageResponse>();
    // 削除済みの投稿は本人にも返さない。
    expect(ownSecondPage.items.map((item) => item.id)).toEqual([
      seeded.ownIds.hidden,
    ]);
    expect(ownSecondPage.nextCursor).toBeNull();

    const supportedFirstResponse = await app.request(
      "/api/v1/history/reactions?limit=2",
      { headers: { Cookie: cookie } },
      env,
    );
    expect(supportedFirstResponse.status).toBe(200);
    const supportedFirstPage =
      await supportedFirstResponse.json<ConcernHistoryPageResponse>();
    // 寄りそった順に並び、相手が非公開へ変えた声は履歴からも外す。
    expect(supportedFirstPage.items.map((item) => item.id)).toEqual([
      seeded.supportedIds.third,
      seeded.supportedIds.second,
    ]);
    expect(supportedFirstPage.items[0]).toMatchObject({
      body: "寄りそった声その3",
      reactionCount: 1,
      reactedAt: "2098-02-07T00:00:00.000Z",
    });
    expect(supportedFirstPage.nextCursor).toBeTruthy();
    expect(JSON.stringify(supportedFirstPage)).not.toContain(user.id);
    expect(JSON.stringify(supportedFirstPage)).not.toContain(seeded.authorId);

    const supportedSecondResponse = await app.request(
      `/api/v1/history/reactions?limit=2&cursor=${encodeURIComponent(supportedFirstPage.nextCursor ?? "")}`,
      { headers: { Cookie: cookie } },
      env,
    );
    const supportedSecondPage =
      await supportedSecondResponse.json<ConcernHistoryPageResponse>();
    expect(supportedSecondPage.items.map((item) => item.id)).toEqual([
      seeded.supportedIds.first,
    ]);
    expect(supportedSecondPage.nextCursor).toBeNull();

    const englishResponse = await app.request(
      "/api/v1/history/concerns?limit=1&language=en",
      { headers: { Cookie: cookie } },
      env,
    );
    expect(await englishResponse.json()).toMatchObject({
      items: [{ attributes: { regionName: "Osaka" } }],
    });

    const summaryResponse = await app.request(
      "/api/v1/history/summary",
      { headers: { Cookie: cookie } },
      env,
    );
    expect(await summaryResponse.json()).toMatchObject({
      contributions: {
        concernCount: 3,
        receivedReactionCount: 1,
        givenReactionCount: 3,
      },
    });

    for (const path of [
      "/api/v1/history/concerns",
      "/api/v1/history/reactions",
    ]) {
      const invalidLimit = await app.request(
        `${path}?limit=0`,
        { headers: { Cookie: cookie } },
        env,
      );
      expect(invalidLimit.status).toBe(400);
      const invalidCursor = await app.request(
        `${path}?cursor=not-a-cursor`,
        { headers: { Cookie: cookie } },
        env,
      );
      expect(invalidCursor.status).toBe(400);
      expect(await invalidCursor.json()).toMatchObject({
        error: { code: "INVALID_CURSOR" },
      });
      const unauthenticated = await app.request(path, {}, env);
      expect(unauthenticated.status).toBe(401);
    }
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
      "/api/v1/history/concerns",
      "/api/v1/history/reactions",
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
