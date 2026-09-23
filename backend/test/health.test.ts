import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app/create-app";
import type { HealthStatus } from "../src/application/entity/health-status.entity";
import { CheckHealthUseCase } from "../src/application/usecase/check-health.usecase";
import { D1HealthRepository } from "../src/infrastructure/database/d1-health.repository";
import { HealthHandler } from "../src/presentation/health.handler";
import { createAuthDependencies } from "./support/auth-fixture";
import { createConcernDependencies } from "./support/concern-fixture";
import { createUserDependencies } from "./support/user-fixture";

describe("GET /health", () => {
  it("returns ok status and database connectivity", async () => {
    const repository = new D1HealthRepository(env.DB);
    const useCase = new CheckHealthUseCase(repository);
    const app = createApp({
      ...createAuthDependencies(),
      ...createConcernDependencies(),
      ...createUserDependencies(),
      healthHandler: new HealthHandler(useCase),
    });
    const res = await app.request("/health", {}, env);

    expect(res.status).toBe(200);

    const body = await res.json<{
      status: string;
      checkedAt: string;
      database: string;
      version: string;
    }>();
    expect(body.status).toBe("ok");
    expect(body.database).toBe("ok");
    expect(() => new Date(body.checkedAt).toISOString()).not.toThrow();
    expect(typeof body.version).toBe("string");
    expect(body.version.length).toBeGreaterThan(0);
  });

  it.each(["ok", "error"] as const)(
    "uses the injected use case result when database status is %s",
    async (database) => {
      let calls = 0;
      const healthHandler = new HealthHandler({
        execute: async (): Promise<HealthStatus> => {
          calls += 1;
          return {
            status: "ok",
            checkedAt: "2026-09-17T00:00:00.000Z",
            database,
            version: "0.1.0",
          };
        },
      });
      const app = createApp({
        ...createAuthDependencies(),
        ...createConcernDependencies(),
        ...createUserDependencies(),
        healthHandler,
      });

      const res = await app.request("/health", {}, env);

      expect(await res.json()).toEqual({
        status: "ok",
        checkedAt: "2026-09-17T00:00:00.000Z",
        database,
        version: "0.1.0",
      });
      expect(calls).toBe(1);
    },
  );

  it.each([
    {
      scenario: "uses the configured CORS origin",
      corsOrigin: "https://frontend.example",
      expectedOrigin: "https://frontend.example",
      expectedCredentials: "true",
    },
    {
      scenario: "uses a non-credentialed wildcard when no origin is configured",
      corsOrigin: undefined,
      expectedOrigin: "*",
      expectedCredentials: null,
    },
  ])(
    "$scenario",
    async ({ corsOrigin, expectedOrigin, expectedCredentials }) => {
      const healthHandler = new HealthHandler({
        execute: async () => ({
          status: "ok",
          checkedAt: "2026-09-17T00:00:00.000Z",
          database: "ok",
          version: "0.1.0",
        }),
      });
      const app = createApp({
        ...createAuthDependencies(),
        ...createConcernDependencies(),
        ...createUserDependencies(),
        healthHandler,
      });
      const bindings = {
        DB: env.DB,
        ...(corsOrigin === undefined ? {} : { CORS_ORIGIN: corsOrigin }),
      };

      const res = await app.request(
        "/health",
        { headers: { Origin: "https://request-origin.example" } },
        bindings,
      );

      expect(res.headers.get("access-control-allow-origin")).toBe(
        expectedOrigin,
      );
      expect(res.headers.get("access-control-allow-credentials")).toBe(
        expectedCredentials,
      );
    },
  );
});
