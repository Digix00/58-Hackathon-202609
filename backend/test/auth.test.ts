import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app/create-app";
import { AuthUseCase } from "../src/application/usecase/auth.usecase";
import { UserUseCase } from "../src/application/usecase/user.usecase";
import {
  D1SessionRepository,
  D1UserRepository,
} from "../src/infrastructure/database/d1-auth.repository";
import { AuthHandler } from "../src/presentation/auth.handler";
import { HealthHandler } from "../src/presentation/health.handler";
import { UserHandler } from "../src/presentation/user.handler";
import { createConcernDependencies } from "./support/concern-fixture";
import { createHistoryDependencies } from "./support/history-fixture";
import { createSpeechDependencies } from "./support/speech-fixture";

function createTestApp(lineUserId = "line_auth_test_user") {
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
    ...createConcernDependencies(),
    ...createSpeechDependencies(),
    ...createHistoryDependencies(),
    userHandler: new UserHandler(new UserUseCase(userRepository)),
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
  it.each(["localhost", "127.0.0.1", "[::1]"])(
    "ローカルHTTP (%s) で開発ログイン・認証API・ログアウトを継続できる",
    async (hostname) => {
      const app = createTestApp();
      const devEnv = { ...env, DEV_AUTH_ENABLED: "true" };
      const baseUrl = `http://${hostname}:8787`;
      const login = await app.request(
        `${baseUrl}/api/v1/auth/dev`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userKey: "demo-a" }),
        },
        devEnv,
      );
      expect(login.status).toBe(200);
      const setCookie = login.headers.get("set-cookie");
      expect(setCookie).toContain("dev-session=");
      expect(setCookie).toContain("HttpOnly");
      expect(setCookie).toContain("SameSite=Lax");
      expect(setCookie).toContain("Path=/");
      expect(setCookie).not.toContain("Secure");
      const cookie = cookieFrom(login);

      const restored = await app.request(
        `${baseUrl}/api/v1/auth/session`,
        { headers: { Cookie: cookie } },
        devEnv,
      );
      expect(await restored.json()).toMatchObject({ authenticated: true });

      // Handlerだけでなく認証middlewareも同じCookieを読むことを確認する。
      const profile = await app.request(
        `${baseUrl}/api/v1/users/me/display-language`,
        {
          method: "PUT",
          headers: { Cookie: cookie, "Content-Type": "application/json" },
          body: JSON.stringify({ displayLanguage: "original" }),
        },
        devEnv,
      );
      expect(profile.status).toBe(200);

      const logout = await app.request(
        `${baseUrl}/api/v1/auth/logout`,
        { method: "POST", headers: { Cookie: cookie } },
        devEnv,
      );
      expect(logout.status).toBe(200);
      expect(logout.headers.get("set-cookie")).toContain("dev-session=");
      expect(logout.headers.get("set-cookie")).toContain("Max-Age=0");
      expect(logout.headers.get("set-cookie")).not.toContain("Secure");
      const afterLogout = await app.request(
        `${baseUrl}/api/v1/auth/session`,
        { headers: { Cookie: cookie } },
        devEnv,
      );
      expect(await afterLogout.json()).toMatchObject({ authenticated: false });

      // 開発用Cookieはフラグなしの環境では認証に使わない。
      const productionSession = await app.request(
        `${baseUrl}/api/v1/auth/session`,
        { headers: { Cookie: cookieFrom(restored.headers.has("set-cookie") ? restored : login) } },
        env,
      );
      expect(await productionSession.json()).toMatchObject({ authenticated: false });
    },
  );

  it.each([
    ["http://localhost:8787", undefined],
    ["http://localhost:8787", "false"],
    ["https://localhost:8787", "true"],
    ["http://example.com", "true"],
    ["http://localhost.example.com", "true"],
    ["https://example.com", "true"],
  ])("開発用HTTP以外ではSecure Cookieを維持する (%s, %s)", async (baseUrl, enabled) => {
    const app = createTestApp();
    const response = await app.request(
      `${baseUrl}/api/v1/auth/session`,
      {},
      { ...env, DEV_AUTH_ENABLED: enabled },
    );
    const cookie = response.headers.get("set-cookie");
    expect(cookie).toContain("__Host-session=");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).not.toContain("Domain=");
  });

  it("does not expose development authentication when disabled", async () => {
    const app = createTestApp();

    const response = await app.request(
      "/api/v1/auth/dev",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userKey: "demo-a" }),
      },
      env,
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { code: "NOT_FOUND" },
    });
  });

  it("creates a regular authenticated session for a development user", async () => {
    const app = createTestApp();
    const devEnv = { ...env, DEV_AUTH_ENABLED: "true" };

    const response = await app.request(
      "/api/v1/auth/dev",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userKey: "demo-a" }),
      },
      devEnv,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      authenticated: true,
      user: {
        id: expect.any(String),
        displayLanguage: "original",
        birthYear: null,
        birthMonth: null,
        gender: null,
        genderName: null,
        regionCode: null,
        regionName: null,
        profileCompleted: false,
      },
    });
    expect(cookieFrom(response)).toContain("__Host-session=");
  });

  it("accepts only the fixed development user keys", async () => {
    const app = createTestApp();

    const response = await app.request(
      "/api/v1/auth/dev",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userKey: "arbitrary-user" }),
      },
      { ...env, DEV_AUTH_ENABLED: "true" },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: "INVALID_REQUEST" },
    });
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
      user: {
        id: expect.any(String),
        displayLanguage: "original",
        birthYear: null,
        birthMonth: null,
        gender: null,
        genderName: null,
        regionCode: null,
        regionName: null,
        profileCompleted: false,
      },
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
      user: {
        id: expect.any(String),
        displayLanguage: "original",
        birthYear: null,
        birthMonth: null,
        gender: null,
        genderName: null,
        regionCode: null,
        regionName: null,
        profileCompleted: false,
      },
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

  it("updates and restores the authenticated user's profile", async () => {
    const app = createTestApp("line_profile_test_user");
    const anonymous = await app.request("/api/v1/auth/session", {}, env);
    const login = await app.request(
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
    const cookie = cookieFrom(login);

    const update = await app.request(
      "/api/v1/users/me",
      {
        method: "PUT",
        headers: {
          Cookie: cookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          birthYear: 2002,
          birthMonth: 9,
          gender: "no_answer",
          regionCode: "hyogo",
        }),
      },
      env,
    );

    expect(update.status).toBe(200);
    expect(await update.json()).toEqual({
      authenticated: true,
      user: {
        id: expect.any(String),
        displayLanguage: "original",
        birthYear: 2002,
        birthMonth: 9,
        gender: "no_answer",
        genderName: "回答しない",
        regionCode: "hyogo",
        regionName: "兵庫県",
        profileCompleted: true,
      },
    });

    const restored = await app.request(
      "/api/v1/auth/session",
      { headers: { Cookie: cookie } },
      env,
    );
    expect(await restored.json()).toEqual({
      authenticated: true,
      user: {
        id: expect.any(String),
        displayLanguage: "original",
        birthYear: 2002,
        birthMonth: 9,
        gender: "no_answer",
        genderName: "回答しない",
        regionCode: "hyogo",
        regionName: "兵庫県",
        profileCompleted: true,
      },
    });
  });

  it("rejects profile updates without an authenticated user", async () => {
    const app = createTestApp("line_profile_auth_required_test_user");

    const response = await app.request(
      "/api/v1/users/me",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          birthYear: 2002,
          birthMonth: 9,
          gender: "no_answer",
          regionCode: "hyogo",
        }),
      },
      env,
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      error: { code: "AUTHENTICATION_REQUIRED" },
    });
  });

  it.each([
    {
      scenario: "future birth year",
      profile: { birthYear: new Date().getUTCFullYear() + 1, birthMonth: 1 },
    },
    {
      scenario: "invalid birth month",
      profile: { birthYear: 2002, birthMonth: 13 },
    },
  ])("rejects $scenario", async ({ profile }) => {
    const app = createTestApp(`line_profile_invalid_${profile.birthMonth}`);
    const anonymous = await app.request("/api/v1/auth/session", {}, env);
    const login = await app.request(
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

    const response = await app.request(
      "/api/v1/users/me",
      {
        method: "PUT",
        headers: {
          Cookie: cookieFrom(login),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...profile,
          gender: "no_answer",
          regionCode: "hyogo",
        }),
      },
      env,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: "INVALID_REQUEST" },
    });
  });
});
