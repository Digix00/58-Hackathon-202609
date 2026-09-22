import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app/create-app";
import { AuthUseCase } from "../src/application/usecase/auth.usecase";
import { UserUseCase } from "../src/application/usecase/user.usecase";
import {
  D1SessionRepository,
  D1UserRepository,
} from "../src/infrastructure/database/d1-auth.repository";
import { users } from "../src/infrastructure/database/schema";
import { AuthHandler } from "../src/presentation/auth.handler";
import { HealthHandler } from "../src/presentation/health.handler";
import { UserHandler } from "../src/presentation/user.handler";
import { createConcernDependencies } from "./support/concern-fixture";

function createTestApp(lineUserId: string) {
  const userRepository = new D1UserRepository(env.DB);
  const authUseCase = new AuthUseCase(
    userRepository,
    new D1SessionRepository(env.DB),
    {
      verify: async (idToken) => {
        if (idToken !== `id-token-${lineUserId}`) {
          throw new Error("unexpected token");
        }
        return { lineUserId };
      },
    },
  );

  return createApp({
    authHandler: new AuthHandler(authUseCase),
    authUseCase,
    ...createConcernDependencies(),
    healthHandler: new HealthHandler({
      execute: async () => ({
        status: "ok",
        checkedAt: "2026-09-22T00:00:00.000Z",
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

async function login(
  app: ReturnType<typeof createTestApp>,
  lineUserId: string,
  profile?: Record<string, unknown>,
): Promise<Response> {
  return app.request(
    "/api/v1/auth/line",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idToken: `id-token-${lineUserId}`,
        ...(profile ? { profile } : {}),
      }),
    },
    env,
  );
}

describe("user profile routes", () => {
  it("persists profile data supplied during LINE login", async () => {
    const lineUserId = "line_profile_login_test_user";
    const app = createTestApp(lineUserId);

    const response = await login(app, lineUserId, {
      birthYear: 2000,
      gender: "female",
      regionCode: "osaka",
    });

    expect(response.status).toBe(200);
    const body = await response.json<{
      authenticated: boolean;
      user: {
        id: string;
        profile: Record<string, unknown>;
        profileCompleted: boolean;
      };
    }>();
    expect(body).toMatchObject({
      authenticated: true,
      user: {
        profile: { birthYear: 2000, gender: "female", regionCode: "osaka" },
        profileCompleted: true,
      },
    });

    const db = drizzle(env.DB);
    const row = await db
      .select({
        birthYear: users.birthYear,
        genderCode: users.genderCode,
        regionCode: users.regionCode,
      })
      .from(users)
      .where(eq(users.lineUserId, lineUserId))
      .get();
    expect(row).toEqual({
      birthYear: 2000,
      genderCode: "female",
      regionCode: "osaka",
    });
  });

  it("updates only the supplied profile fields for the authenticated user", async () => {
    const lineUserId = "line_profile_update_test_user";
    const app = createTestApp(lineUserId);
    const loginResponse = await login(app, lineUserId, {
      birthYear: 1998,
      gender: "male",
      regionCode: "tokyo",
    });
    const cookie = cookieFrom(loginResponse);

    const update = await app.request(
      "/api/v1/users/me",
      {
        method: "PATCH",
        headers: {
          Cookie: cookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ regionCode: "hyogo" }),
      },
      env,
    );

    expect(update.status).toBe(200);
    expect(await update.json()).toMatchObject({
      profile: { birthYear: 1998, gender: "male", regionCode: "hyogo" },
      profileCompleted: true,
    });

    const session = await app.request(
      "/api/v1/auth/session",
      { headers: { Cookie: cookie } },
      env,
    );
    expect(await session.json()).toMatchObject({
      authenticated: true,
      user: {
        profile: { birthYear: 1998, gender: "male", regionCode: "hyogo" },
        profileCompleted: true,
      },
    });
  });

  it("rejects invalid profile values", async () => {
    const lineUserId = "line_profile_validation_test_user";
    const app = createTestApp(lineUserId);
    const loginResponse = await login(app, lineUserId);
    const cookie = cookieFrom(loginResponse);

    const update = await app.request(
      "/api/v1/users/me",
      {
        method: "PATCH",
        headers: {
          Cookie: cookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          birthYear: new Date().getUTCFullYear() + 1,
          gender: "unknown",
          regionCode: "unknown",
        }),
      },
      env,
    );

    expect(update.status).toBe(400);
    expect(await update.json()).toMatchObject({
      error: { code: "INVALID_REQUEST" },
    });
  });

  it("requires an authenticated LINE user to update a profile", async () => {
    const app = createTestApp("line_profile_auth_test_user");

    const response = await app.request(
      "/api/v1/users/me",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regionCode: "osaka" }),
      },
      env,
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      error: { code: "AUTHENTICATION_REQUIRED" },
    });
  });
});
