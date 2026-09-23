import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app/create-app";
import { AuthUseCase } from "../src/application/usecase/auth.usecase";
import { ConcernUseCase } from "../src/application/usecase/concern.usecase";
import { ConcernReactionUseCase } from "../src/application/usecase/concern-reaction.usecase";
import { ConcernViewUseCase } from "../src/application/usecase/concern-view.usecase";
import { UserUseCase } from "../src/application/usecase/user.usecase";
import {
  D1SessionRepository,
  D1UserRepository,
} from "../src/infrastructure/database/d1-auth.repository";
import { D1ConcernRepository } from "../src/infrastructure/database/d1-concern.repository";
import { D1ConcernReactionRepository } from "../src/infrastructure/database/d1-concern-reaction.repository";
import { D1ConcernViewRepository } from "../src/infrastructure/database/d1-concern-view.repository";
import {
  concerns,
  concernViews,
  users,
} from "../src/infrastructure/database/schema";
import { AuthHandler } from "../src/presentation/auth.handler";
import { ConcernHandler } from "../src/presentation/concern.handler";
import { ConcernReactionHandler } from "../src/presentation/concern-reaction.handler";
import { ConcernViewHandler } from "../src/presentation/concern-view.handler";
import { HealthHandler } from "../src/presentation/health.handler";
import { UserHandler } from "../src/presentation/user.handler";

function createTestApp(lineUserId = `line-view-${crypto.randomUUID()}`) {
  const userRepository = new D1UserRepository(env.DB);
  const authUseCase = new AuthUseCase(
    userRepository,
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

  return createApp({
    authHandler: new AuthHandler(authUseCase),
    authUseCase,
    concernHandler: new ConcernHandler(
      new ConcernUseCase(new D1ConcernRepository(env.DB)),
    ),
    concernReactionHandler: new ConcernReactionHandler(
      new ConcernReactionUseCase(new D1ConcernReactionRepository(env.DB)),
    ),
    concernViewHandler: new ConcernViewHandler(
      new ConcernViewUseCase(new D1ConcernViewRepository(env.DB)),
    ),
    healthHandler: new HealthHandler({
      execute: async () => ({
        status: "ok",
        checkedAt: "2026-09-23T00:00:00.000Z",
        database: "ok",
        version: "0.1.0",
      }),
    }),
    userHandler: new UserHandler(new UserUseCase(userRepository)),
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

async function seedConcern(
  visibilityStatus: "published" | "hidden" | "deleted" = "published",
): Promise<string> {
  const suffix = crypto.randomUUID();
  const userId = `view-owner-${suffix}`;
  const concernId = `view-concern-${suffix}`;
  const createdAt = "2026-09-23T00:00:00.000Z";
  const db = drizzle(env.DB);

  await db
    .insert(users)
    .values({
      id: userId,
      lineUserId: `view-line-${suffix}`,
      createdAt,
      updatedAt: createdAt,
    })
    .run();
  await db
    .insert(concerns)
    .values({
      id: concernId,
      userId,
      body: "既読テスト用の公開投稿です",
      visibilityStatus,
      processingStatus: "pending",
      createdAt,
      updatedAt: createdAt,
    })
    .run();

  return concernId;
}

describe("POST /api/v1/concerns/:concernId/views", () => {
  it("requires a logged-in LINE session", async () => {
    const app = createTestApp();
    const withoutSession = await app.request(
      "/api/v1/concerns/missing/views",
      { method: "POST" },
      env,
    );

    expect(withoutSession.status).toBe(401);
    expect(await withoutSession.json()).toMatchObject({
      error: { code: "AUTHENTICATION_REQUIRED" },
    });

    const anonymousSession = await app.request("/api/v1/auth/session", {}, env);
    const anonymousCookie = cookieFrom(anonymousSession);
    const anonymousPost = await app.request(
      "/api/v1/concerns/missing/views",
      { method: "POST", headers: { Cookie: anonymousCookie } },
      env,
    );

    expect(anonymousPost.status).toBe(401);
  });

  it("records only one row for repeated requests from the same actor", async () => {
    const lineUserId = "line-view-private-identity";
    const app = createTestApp(lineUserId);
    const cookie = await loginCookie(app);
    const concernId = await seedConcern();
    const path = `/api/v1/concerns/${concernId}/views`;

    const first = await app.request(
      path,
      { method: "POST", headers: { Cookie: cookie } },
      env,
    );
    const second = await app.request(
      path,
      { method: "POST", headers: { Cookie: cookie } },
      env,
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const firstBody = await first.json<{
      concernId: string;
      viewed: boolean;
      viewedAt: string;
    }>();
    const secondBody = await second.json<typeof firstBody>();
    expect(firstBody).toMatchObject({ concernId, viewed: true });
    expect(secondBody).toEqual(firstBody);
    expect(firstBody).not.toHaveProperty("actorKey");

    const rows = await drizzle(env.DB)
      .select()
      .from(concernViews)
      .where(eq(concernViews.concernId, concernId));
    expect(rows).toHaveLength(1);
    expect(rows[0].actorKey).not.toBe(lineUserId);
    expect(rows[0].viewedAt).toBe(firstBody.viewedAt);
  });

  it("keeps separate records for different actors", async () => {
    const concernId = await seedConcern();
    const firstApp = createTestApp();
    const secondApp = createTestApp();
    const firstCookie = await loginCookie(firstApp);
    const secondCookie = await loginCookie(secondApp);
    const path = `/api/v1/concerns/${concernId}/views`;

    for (const [app, cookie] of [
      [firstApp, firstCookie],
      [secondApp, secondCookie],
    ] as const) {
      const response = await app.request(
        path,
        { method: "POST", headers: { Cookie: cookie } },
        env,
      );
      expect(response.status).toBe(200);
    }

    const rows = await drizzle(env.DB)
      .select()
      .from(concernViews)
      .where(eq(concernViews.concernId, concernId));
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.actorKey)).size).toBe(2);
  });

  it.each(["hidden", "deleted"] as const)(
    "rejects a %s concern",
    async (visibilityStatus) => {
      const app = createTestApp();
      const cookie = await loginCookie(app);
      const concernId = await seedConcern(visibilityStatus);
      const response = await app.request(
        `/api/v1/concerns/${concernId}/views`,
        { method: "POST", headers: { Cookie: cookie } },
        env,
      );

      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({
        error: { code: "NOT_FOUND" },
      });
      const rows = await drizzle(env.DB)
        .select()
        .from(concernViews)
        .where(eq(concernViews.concernId, concernId));
      expect(rows).toHaveLength(0);
    },
  );
});
