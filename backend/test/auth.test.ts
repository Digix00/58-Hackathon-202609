import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../src/app/create-app";
import { AuthUseCase } from "../src/application/usecase/auth.usecase";
import { D1SessionRepository, D1UserRepository } from "../src/infrastructure/database/d1-auth.repository";
import { AuthHandler } from "../src/presentation/auth.handler";
import { HealthHandler } from "../src/presentation/health.handler";

function createTestApp() {
  const authUseCase = new AuthUseCase(
    new D1UserRepository(env.DB),
    new D1SessionRepository(env.DB),
    {
      verify: async (idToken) => {
        if (idToken !== "valid-id-token") {
          throw new Error("unexpected token");
        }
        return { lineUserId: "line_auth_test_user" };
      },
    },
  );

  return createApp({
    authHandler: new AuthHandler(authUseCase),
    authUseCase,
    healthHandler: new HealthHandler({
      execute: async () => ({
        status: "ok",
        checkedAt: "2026-09-17T00:00:00.000Z",
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

describe("authentication routes", () => {
  beforeAll(async () => {
    await env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY NOT NULL, line_user_id TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
    ).run();
    await env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY NOT NULL, token_hash TEXT NOT NULL UNIQUE, user_id TEXT, expires_at TEXT NOT NULL, created_at TEXT NOT NULL, revoked_at TEXT, FOREIGN KEY (user_id) REFERENCES users(id))",
    ).run();
  });

  it("creates an anonymous session and restores it", async () => {
    const app = createTestApp();

    const first = await app.request("/api/v1/auth/session", {}, env);
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ authenticated: false, user: null });

    const cookie = cookieFrom(first);
    const restored = await app.request(
      "/api/v1/auth/session",
      { headers: { Cookie: cookie } },
      env,
    );
    expect(restored.status).toBe(200);
    expect(await restored.json()).toEqual({
      authenticated: false,
      user: null,
    });
  });

  it("rotates the session after LINE authentication and revokes it on logout", async () => {
    const app = createTestApp();
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

    expect(login.status).toBe(200);
    expect(await login.json()).toEqual({
      authenticated: true,
      user: { id: expect.any(String) },
    });

    const authenticatedCookie = cookieFrom(login);
    expect(authenticatedCookie).not.toBe(anonymousCookie);

    const restored = await app.request(
      "/api/v1/auth/session",
      { headers: { Cookie: authenticatedCookie } },
      env,
    );
    expect(await restored.json()).toEqual({
      authenticated: true,
      user: { id: expect.any(String) },
    });

    const logout = await app.request(
      "/api/v1/auth/logout",
      { method: "POST", headers: { Cookie: authenticatedCookie } },
      env,
    );
    expect(logout.status).toBe(200);

    const afterLogout = await app.request(
      "/api/v1/auth/session",
      { headers: { Cookie: authenticatedCookie } },
      env,
    );
    expect(await afterLogout.json()).toEqual({
      authenticated: false,
      user: null,
    });
  });
});
