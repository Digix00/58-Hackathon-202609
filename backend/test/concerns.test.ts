import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app/create-app";
import { AuthUseCase } from "../src/application/usecase/auth.usecase";
import { ConcernUseCase } from "../src/application/usecase/concern.usecase";
import { ConcernReactionUseCase } from "../src/application/usecase/concern-reaction.usecase";
import {
  D1SessionRepository,
  D1UserRepository,
} from "../src/infrastructure/database/d1-auth.repository";
import { D1ConcernRepository } from "../src/infrastructure/database/d1-concern.repository";
import { D1ConcernReactionRepository } from "../src/infrastructure/database/d1-concern-reaction.repository";
import {
  concernClusters,
  concernReactions,
  concerns,
  users,
} from "../src/infrastructure/database/schema";
import { AuthHandler } from "../src/presentation/auth.handler";
import { ConcernHandler } from "../src/presentation/concern.handler";
import { ConcernReactionHandler } from "../src/presentation/concern-reaction.handler";
import { HealthHandler } from "../src/presentation/health.handler";
import { createAuthDependencies } from "./support/auth-fixture";
import { createConcernDependencies } from "./support/concern-fixture";
import { createUserDependencies } from "./support/user-fixture";

function createTestApp(lineUserId = "line_concern_test_user") {
  const authUseCase = new AuthUseCase(
    new D1UserRepository(env.DB),
    new D1SessionRepository(env.DB),
    {
      verify: async (idToken) => {
        if (idToken !== "valid-id-token") {
          throw new Error("unexpected token");
        }
        return { lineUserId };
      },
    },
  );
  const concernHandler = new ConcernHandler(
    new ConcernUseCase(new D1ConcernRepository(env.DB)),
  );
  const concernReactionHandler = new ConcernReactionHandler(
    new ConcernReactionUseCase(new D1ConcernReactionRepository(env.DB)),
  );

  return createApp({
    authHandler: new AuthHandler(authUseCase),
    authUseCase,
    ...createConcernDependencies(),
    concernHandler,
    concernReactionHandler,
    ...createUserDependencies(),
    healthHandler: new HealthHandler({
      execute: async () => ({
        status: "ok",
        checkedAt: "2026-09-22T00:00:00.000Z",
        database: "ok",
        version: "0.1.0",
      }),
    }),
  });
}

function anonymousTestApp() {
  return createApp({
    ...createAuthDependencies(),
    ...createConcernDependencies(),
    ...createUserDependencies(),
    healthHandler: new HealthHandler({
      execute: async () => ({
        status: "ok",
        checkedAt: "2026-09-22T00:00:00.000Z",
        database: "ok",
        version: "0.1.0",
      }),
    }),
  });
}

function cookieFrom(response: Response): string {
  const value = response.headers.get("set-cookie");
  if (!value) {
    throw new Error("session cookie was not set");
  }
  return value.split(";", 1)[0];
}

async function loginCookie(
  app: ReturnType<typeof createTestApp>,
): Promise<string> {
  const anonymous = await app.request("/api/v1/auth/session", {}, env);
  const anonymousCookie = cookieFrom(anonymous);

  const login = await app.request(
    "/api/v1/auth/line",
    {
      method: "POST",
      headers: {
        Cookie: anonymousCookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ idToken: "valid-id-token" }),
    },
    env,
  );
  return cookieFrom(login);
}

async function createConcern(
  app: ReturnType<typeof createTestApp>,
  cookie: string,
): Promise<string> {
  const response = await app.request(
    "/api/v1/concerns",
    {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    },
    env,
  );
  if (response.status !== 201) {
    throw new Error("failed to create concern for reaction test");
  }

  const created = await response.json<{ id: string }>();
  return created.id;
}

const validBody = {
  body: "食堂が混んでいて、昼休みにゆっくり食べられない",
  ageGroup: "20s",
  gender: "no_answer",
  regionCode: "osaka",
};

async function seedConcern(input: {
  body: string;
  createdAt: string;
  id?: string;
  regionCode?: string | null;
  clusterId?: string | null;
  visibilityStatus?: "published" | "hidden" | "deleted";
}): Promise<string> {
  const suffix = crypto.randomUUID();
  const userId = `user-${suffix}`;
  const concernId = input.id ?? `concern-${suffix}`;
  const db = drizzle(env.DB);

  await db
    .insert(users)
    .values({
      id: userId,
      lineUserId: `line-${suffix}`,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    })
    .run();
  await db
    .insert(concerns)
    .values({
      id: concernId,
      userId,
      body: input.body,
      ageGroup: null,
      genderCode: null,
      regionCode: input.regionCode ?? null,
      clusterId: input.clusterId ?? null,
      visibilityStatus: input.visibilityStatus ?? "published",
      processingStatus: "pending",
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    })
    .run();

  return concernId;
}

async function seedCluster(input: {
  id?: string;
  label?: string;
  summary?: string;
}): Promise<string> {
  const id = input.id ?? `cluster-${crypto.randomUUID()}`;
  const timestamp = new Date().toISOString();
  await drizzle(env.DB)
    .insert(concernClusters)
    .values({
      id,
      label: input.label ?? "食事のテーマ",
      summary: input.summary ?? "食事や休憩に関する悩み",
      status: "ready",
      modelVersion: "test",
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .run();
  return id;
}

describe("POST /api/v1/concerns", () => {
  it("rejects requests without a session", async () => {
    const app = anonymousTestApp();

    const res = await app.request(
      "/api/v1/concerns",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validBody),
      },
      env,
    );

    expect(res.status).toBe(401);
    const body = await res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("rejects an anonymous (not-yet-logged-in) session cookie", async () => {
    const app = createTestApp();
    const anonymous = await app.request("/api/v1/auth/session", {}, env);
    const anonymousCookie = cookieFrom(anonymous);

    const res = await app.request(
      "/api/v1/concerns",
      {
        method: "POST",
        headers: {
          Cookie: anonymousCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(validBody),
      },
      env,
    );

    expect(res.status).toBe(401);
  });

  it("creates a concern for a logged-in user and omits unset optional attributes", async () => {
    const app = createTestApp();
    const cookie = await loginCookie(app);

    const res = await app.request(
      "/api/v1/concerns",
      {
        method: "POST",
        headers: { Cookie: cookie, "Content-Type": "application/json" },
        body: JSON.stringify({
          body: "属性なしの投稿です",
        }),
      },
      env,
    );

    expect(res.status).toBe(201);
    const created = await res.json<Record<string, unknown>>();
    expect(created).toMatchObject({
      body: "属性なしの投稿です",
      visibilityStatus: "published",
      processingStatus: "pending",
      representations: { jaHira: null, en: null },
      cluster: null,
      reactionCount: 0,
    });
    expect(created.attributes).toEqual({});
    expect(created.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(() =>
      new Date(created.createdAt as string).toISOString(),
    ).not.toThrow();

    const db = drizzle(env.DB);
    const rows = await db
      .select()
      .from(concerns)
      .where(eq(concerns.id, created.id as string));
    expect(rows).toHaveLength(1);
    expect(rows[0]).not.toHaveProperty("inputMethod");
    expect(created).not.toHaveProperty("inputMethod");
  });

  it("saves and returns provided optional attributes", async () => {
    const app = createTestApp();
    const cookie = await loginCookie(app);

    const res = await app.request(
      "/api/v1/concerns",
      {
        method: "POST",
        headers: { Cookie: cookie, "Content-Type": "application/json" },
        body: JSON.stringify(validBody),
      },
      env,
    );

    expect(res.status).toBe(201);
    const created = await res.json<{ attributes: Record<string, unknown> }>();
    expect(created.attributes).toEqual({
      ageGroup: "20s",
      gender: "no_answer",
      regionCode: "osaka",
    });
  });

  it("accepts the highest configured age group", async () => {
    const app = createTestApp();
    const cookie = await loginCookie(app);

    const res = await app.request(
      "/api/v1/concerns",
      {
        method: "POST",
        headers: { Cookie: cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ ...validBody, ageGroup: "90s_plus" }),
      },
      env,
    );

    expect(res.status).toBe(201);
    const created = await res.json<{ attributes: Record<string, unknown> }>();
    expect(created.attributes.ageGroup).toBe("90s_plus");
  });

  it("ignores a userId supplied in the request body", async () => {
    const app = createTestApp();
    const cookie = await loginCookie(app);

    const res = await app.request(
      "/api/v1/concerns",
      {
        method: "POST",
        headers: { Cookie: cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ ...validBody, userId: "someone-elses-id" }),
      },
      env,
    );

    expect(res.status).toBe(201);
    const created = await res.json<Record<string, unknown>>();
    expect(created).not.toHaveProperty("userId");
  });

  it.each([
    { scenario: "missing body", payload: {} },
    {
      scenario: "whitespace-only body",
      payload: { body: "   " },
    },
    {
      scenario: "body over 1000 characters",
      payload: { body: "a".repeat(1001) },
    },
    {
      scenario: "unknown ageGroup",
      payload: { ...validBody, ageGroup: "unknown" },
    },
    {
      scenario: "unknown gender",
      payload: { ...validBody, gender: "unknown" },
    },
    {
      scenario: "unknown regionCode",
      payload: { ...validBody, regionCode: "unknown" },
    },
  ])("rejects $scenario with 400 INVALID_REQUEST", async ({ payload }) => {
    const app = createTestApp();
    const cookie = await loginCookie(app);

    const res = await app.request(
      "/api/v1/concerns",
      {
        method: "POST",
        headers: { Cookie: cookie, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
      env,
    );

    expect(res.status).toBe(400);
    const body = await res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe("INVALID_REQUEST");
  });
});

describe("GET /api/v1/concerns", () => {
  it("returns a concern created by another session", async () => {
    const app = createTestApp();
    const cookie = await loginCookie(app);
    const created = await app.request(
      "/api/v1/concerns",
      {
        method: "POST",
        headers: { Cookie: cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ body: "別セッションから読める投稿" }),
      },
      env,
    );
    expect(created.status).toBe(201);
    const createdBody = await created.json<{ id: string }>();

    const res = await app.request("/api/v1/concerns", {}, env);

    expect(res.status).toBe(200);
    const body = await res.json<{
      items: Array<Record<string, unknown>>;
      nextCursor: string | null;
    }>();
    const item = body.items.find((value) => value.id === createdBody.id);
    expect(item).toMatchObject({
      id: createdBody.id,
      body: "別セッションから読める投稿",
      language: "original",
      reactionCount: 0,
      viewed: false,
      reacted: false,
      recommendation: { strategy: "newest", reasonCode: "newest" },
    });
  });

  it("returns only published concerns in newest order", async () => {
    const publishedNew = await seedConcern({
      body: "公開された新しい投稿",
      createdAt: "9999-01-03T00:00:00.000Z",
    });
    const publishedOld = await seedConcern({
      body: "公開された古い投稿",
      createdAt: "9999-01-01T00:00:00.000Z",
    });
    const hidden = await seedConcern({
      body: "非公開の投稿",
      createdAt: "9999-01-05T00:00:00.000Z",
      visibilityStatus: "hidden",
    });
    const deleted = await seedConcern({
      body: "削除済みの投稿",
      createdAt: "9999-01-04T00:00:00.000Z",
      visibilityStatus: "deleted",
    });

    const res = await createTestApp().request(
      "/api/v1/concerns?limit=50&sort=newest",
      {},
      env,
    );

    expect(res.status).toBe(200);
    const body = await res.json<{
      items: Array<{ id: string }>;
      nextCursor: string | null;
    }>();
    const ids = body.items.map((item) => item.id);
    expect(ids).toContain(publishedNew);
    expect(ids).toContain(publishedOld);
    expect(ids).not.toContain(hidden);
    expect(ids).not.toContain(deleted);
    expect(ids.indexOf(publishedNew)).toBeLessThan(ids.indexOf(publishedOld));
  });

  it("filters by the exact prefecture code", async () => {
    const osaka = await seedConcern({
      body: "大阪の投稿",
      regionCode: "osaka",
      createdAt: "9999-01-10T00:00:00.000Z",
    });
    const tokyo = await seedConcern({
      body: "東京の投稿",
      regionCode: "tokyo",
      createdAt: "9999-01-11T00:00:00.000Z",
    });

    const response = await createTestApp().request(
      "/api/v1/concerns?regionCode=osaka",
      {},
      env,
    );
    const body = await response.json<{ items: Array<{ id: string }> }>();

    expect(response.status).toBe(200);
    expect(body.items.map((item) => item.id)).toContain(osaka);
    expect(body.items.map((item) => item.id)).not.toContain(tokyo);
  });

  it("returns a recommendation reason and cluster for a logged-in feed", async () => {
    const clusterId = await seedCluster({
      label: "昼休み・食堂",
      summary: "昼休み中の食事や休憩に関する悩み",
    });
    const concernId = await seedConcern({
      body: "おすすめ対象の投稿",
      clusterId,
      regionCode: "osaka",
      createdAt: "9999-01-12T00:00:00.000Z",
    });
    const app = createTestApp();
    const cookie = await loginCookie(app);

    const response = await app.request(
      "/api/v1/concerns?sort=recommended&limit=10",
      { headers: { Cookie: cookie } },
      env,
    );
    const body = await response.json<{
      items: Array<{
        id: string;
        cluster: { id: string; label: string; summary: string } | null;
        recommendation: { strategy: string; reasonCode: string };
      }>;
    }>();
    const item = body.items.find((value) => value.id === concernId);

    expect(response.status).toBe(200);
    expect(item).toMatchObject({
      id: concernId,
      cluster: {
        id: clusterId,
        label: "昼休み・食堂",
      },
      recommendation: {
        strategy: "recommended",
        reasonCode: "unread_cluster",
      },
    });
  });

  it("does not skip candidates across recommended pages", async () => {
    const suffix = crypto.randomUUID();
    const clusterId = await seedCluster({
      id: `recommended-pagination-cluster-${suffix}`,
      label: "推薦ページング",
      summary: "推薦ページングのテスト用クラスタ",
    });
    const expectedIds = Array.from(
      { length: 101 },
      (_, index) =>
        `recommended-pagination-${suffix}-${String(index).padStart(3, "0")}`,
    );
    for (const id of expectedIds) {
      await seedConcern({
        id,
        body: "推薦ページングのテスト投稿",
        clusterId,
        createdAt: "9998-06-01T00:00:00.000Z",
      });
    }

    const app = createTestApp();
    const cookie = await loginCookie(app);
    const receivedIds: string[] = [];
    let cursor: string | null = null;
    let pageCount = 0;

    while (true) {
      const query = new URLSearchParams({
        clusterId,
        limit: "20",
        sort: "recommended",
      });
      if (cursor) {
        query.set("cursor", cursor);
      }

      const response = await app.request(
        `/api/v1/concerns?${query.toString()}`,
        { headers: { Cookie: cookie } },
        env,
      );
      const body = await response.json<{
        items: Array<{ id: string }>;
        nextCursor: string | null;
      }>();

      expect(response.status).toBe(200);
      receivedIds.push(...body.items.map((item) => item.id));
      pageCount += 1;
      cursor = body.nextCursor;

      if (!cursor) {
        break;
      }
      if (pageCount > 10) {
        throw new Error("recommended pagination did not terminate");
      }
    }

    expect(pageCount).toBe(6);
    expect(receivedIds).toHaveLength(expectedIds.length);
    expect(new Set(receivedIds).size).toBe(expectedIds.length);
    expect(new Set(receivedIds)).toEqual(new Set(expectedIds));
  });

  it("paginates with an opaque cursor without duplicating items", async () => {
    const suffix = crypto.randomUUID();
    const createdAt = "9999-02-01T00:00:00.000Z";
    const first = await seedConcern({
      id: `issue63-${suffix}-c`,
      body: "カーソルページの1件目",
      createdAt,
    });
    const second = await seedConcern({
      id: `issue63-${suffix}-b`,
      body: "カーソルページの2件目",
      createdAt,
    });
    const third = await seedConcern({
      id: `issue63-${suffix}-a`,
      body: "カーソルページの3件目",
      createdAt,
    });

    const app = createTestApp();
    const firstPage = await app.request(
      "/api/v1/concerns?limit=2&sort=newest",
      {},
      env,
    );
    const firstBody = await firstPage.json<{
      items: Array<{ id: string }>;
      nextCursor: string | null;
    }>();
    const firstIds = firstBody.items.map((item) => item.id);

    expect(firstPage.status).toBe(200);
    expect(firstIds).toEqual([first, second]);
    expect(firstBody.nextCursor).toEqual(expect.any(String));

    const secondPage = await app.request(
      `/api/v1/concerns?limit=2&sort=newest&cursor=${encodeURIComponent(firstBody.nextCursor ?? "")}`,
      {},
      env,
    );
    const secondBody = await secondPage.json<{
      items: Array<{ id: string }>;
      nextCursor: string | null;
    }>();
    const secondIds = secondBody.items.map((item) => item.id);

    expect(secondPage.status).toBe(200);
    expect(secondIds).toContain(third);
    for (const id of firstIds) {
      expect(secondIds).not.toContain(id);
    }
  });

  it.each([
    ["limit=0", "INVALID_REQUEST"],
    ["limit=51", "INVALID_REQUEST"],
    ["sort=unknown", "INVALID_REQUEST"],
    ["regionCode=kanto", "INVALID_REQUEST"],
    ["cursor=invalid", "INVALID_CURSOR"],
  ])("rejects invalid query %s", async (query, code) => {
    const res = await createTestApp().request(
      `/api/v1/concerns?${query}`,
      {},
      env,
    );

    expect(res.status).toBe(400);
    const body = await res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe(code);
  });

  it("requires authentication for recommended sorting", async () => {
    const res = await createTestApp().request(
      "/api/v1/concerns?sort=recommended",
      {},
      env,
    );

    expect(res.status).toBe(400);
    const body = await res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });
});

describe("GET /api/v1/concerns/:concernId", () => {
  it("returns a published concern without identifying information", async () => {
    const id = await seedConcern({
      body: "詳細で読む公開投稿",
      createdAt: "9999-03-01T00:00:00.000Z",
    });

    const res = await createTestApp().request(
      `/api/v1/concerns/${id}`,
      {},
      env,
    );

    expect(res.status).toBe(200);
    const body = await res.json<Record<string, unknown>>();
    expect(body).toMatchObject({
      id,
      body: "詳細で読む公開投稿",
      language: "original",
    });
    expect(body).not.toHaveProperty("userId");
    expect(body).not.toHaveProperty("recommendation");
  });

  it("returns 404 for hidden, deleted, or missing concerns", async () => {
    const hidden = await seedConcern({
      body: "非公開詳細",
      createdAt: "9999-04-01T00:00:00.000Z",
      visibilityStatus: "hidden",
    });
    const deleted = await seedConcern({
      body: "削除済み詳細",
      createdAt: "9999-04-02T00:00:00.000Z",
      visibilityStatus: "deleted",
    });
    const app = createTestApp();

    for (const id of [hidden, deleted, "missing-concern"]) {
      const res = await app.request(`/api/v1/concerns/${id}`, {}, env);
      expect(res.status).toBe(404);
      const body = await res.json<{ error: { code: string } }>();
      expect(body.error.code).toBe("NOT_FOUND");
    }
  });
});

describe("POST /api/v1/concerns/:concernId/reactions", () => {
  it("creates a reaction and treats a retry as an idempotent success", async () => {
    const app = createTestApp();
    const cookie = await loginCookie(app);
    const concernId = await createConcern(app, cookie);
    const request = {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ reactionType: "empathy" }),
    } as const;
    const path = "/api/v1/concerns/" + concernId + "/reactions";

    const first = await app.request(path, request, env);
    const firstBody = await first.json<Record<string, unknown>>();
    expect(first.status).toBe(201);
    expect(firstBody).toEqual({
      concernId,
      reactionType: "empathy",
      reactionCount: 1,
      reacted: true,
    });

    const retry = await app.request(path, request, env);
    const retryBody = await retry.json<Record<string, unknown>>();
    expect(retry.status).toBe(200);
    expect(retryBody).toEqual(firstBody);

    const rows = await drizzle(env.DB)
      .select()
      .from(concernReactions)
      .where(eq(concernReactions.concernId, concernId));
    expect(rows).toHaveLength(1);
  });

  it("counts a reaction from a different user separately", async () => {
    const ownerApp = createTestApp("line_concern_reaction_owner");
    const ownerCookie = await loginCookie(ownerApp);
    const concernId = await createConcern(ownerApp, ownerCookie);
    const path = "/api/v1/concerns/" + concernId + "/reactions";

    const reactorApp = createTestApp("line_concern_reaction_other");
    const reactorCookie = await loginCookie(reactorApp);
    const response = await reactorApp.request(
      path,
      {
        method: "POST",
        headers: {
          Cookie: reactorCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reactionType: "empathy" }),
      },
      env,
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      concernId,
      reactionType: "empathy",
      reactionCount: 1,
      reacted: true,
    });

    const ownerResponse = await ownerApp.request(
      path,
      {
        method: "POST",
        headers: {
          Cookie: ownerCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reactionType: "empathy" }),
      },
      env,
    );
    expect(ownerResponse.status).toBe(201);
    await expect(ownerResponse.json()).resolves.toMatchObject({
      reactionCount: 2,
    });
  });

  it.each([{ status: "hidden" as const }, { status: "deleted" as const }])(
    "rejects a $status concern",
    async ({ status }) => {
      const app = createTestApp();
      const cookie = await loginCookie(app);
      const concernId = await createConcern(app, cookie);
      await drizzle(env.DB)
        .update(concerns)
        .set({ visibilityStatus: status })
        .where(eq(concerns.id, concernId));

      const response = await app.request(
        "/api/v1/concerns/" + concernId + "/reactions",
        {
          method: "POST",
          headers: { Cookie: cookie, "Content-Type": "application/json" },
          body: JSON.stringify({ reactionType: "empathy" }),
        },
        env,
      );

      expect(response.status).toBe(404);
      const body = await response.json<{ error: { code: string } }>();
      expect(body.error.code).toBe("NOT_FOUND");
    },
  );

  it.each([
    { scenario: "missing reactionType", payload: {} },
    { scenario: "unsupported reactionType", payload: { reactionType: "like" } },
  ])("rejects $scenario with 400 INVALID_REQUEST", async ({ payload }) => {
    const app = createTestApp();
    const cookie = await loginCookie(app);
    const concernId = await createConcern(app, cookie);

    const response = await app.request(
      "/api/v1/concerns/" + concernId + "/reactions",
      {
        method: "POST",
        headers: {
          Cookie: cookie,
          "Content-Type": "application/json",
          "X-Request-Id": "reaction-validation",
        },
        body: JSON.stringify(payload),
      },
      env,
    );

    expect(response.status).toBe(400);
    const body = await response.json<{
      error: { code: string; requestId: string };
    }>();
    expect(body.error.code).toBe("INVALID_REQUEST");
    expect(body.error.requestId).toBe(response.headers.get("X-Request-Id"));
    expect(body.error.requestId).toBe("reaction-validation");
  });

  it("requires a LINE-authenticated session", async () => {
    const app = anonymousTestApp();
    const response = await app.request(
      "/api/v1/concerns/not-a-concern/reactions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Request-Id": "reaction-auth",
        },
        body: JSON.stringify({ reactionType: "empathy" }),
      },
      env,
    );

    expect(response.status).toBe(401);
    const body = await response.json<{
      error: { code: string; requestId: string };
    }>();
    expect(body.error.code).toBe("AUTHENTICATION_REQUIRED");
    expect(body.error.requestId).toBe(response.headers.get("X-Request-Id"));
    expect(body.error.requestId).toBe("reaction-auth");
  });
});
