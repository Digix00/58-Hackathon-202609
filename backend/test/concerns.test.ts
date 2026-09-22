import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app/create-app";
import { AuthUseCase } from "../src/application/usecase/auth.usecase";
import { ConcernUseCase } from "../src/application/usecase/concern.usecase";
import {
  D1SessionRepository,
  D1UserRepository,
} from "../src/infrastructure/database/d1-auth.repository";
import { D1ConcernRepository } from "../src/infrastructure/database/d1-concern.repository";
import { concerns } from "../src/infrastructure/database/schema";
import { AuthHandler } from "../src/presentation/auth.handler";
import { ConcernHandler } from "../src/presentation/concern.handler";
import { HealthHandler } from "../src/presentation/health.handler";
import { createAuthDependencies } from "./support/auth-fixture";
import { createConcernDependencies } from "./support/concern-fixture";
import { createUserDependencies } from "./support/user-fixture";

function createTestApp() {
  const authUseCase = new AuthUseCase(
    new D1UserRepository(env.DB),
    new D1SessionRepository(env.DB),
    {
      verify: async (idToken) => {
        if (idToken !== "valid-id-token") {
          throw new Error("unexpected token");
        }
        return { lineUserId: "line_concern_test_user" };
      },
    },
  );
  const concernHandler = new ConcernHandler(
    new ConcernUseCase(new D1ConcernRepository(env.DB)),
  );

  return createApp({
    authHandler: new AuthHandler(authUseCase),
    authUseCase,
    concernHandler,
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

async function loginCookie(app: ReturnType<typeof createTestApp>): Promise<string> {
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

const validBody = {
  body: "食堂が混んでいて、昼休みにゆっくり食べられない",
  ageGroup: "20s",
  gender: "no_answer",
  regionCode: "osaka",
};

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
    expect(() => new Date(created.createdAt as string).toISOString()).not.toThrow();

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
