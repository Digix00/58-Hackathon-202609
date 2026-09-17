import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app/create-app";
import { CheckHealthUseCase } from "../src/features/health/application/check-health.usecase";
import { D1HealthRepository } from "../src/features/health/infrastructure/d1-health.repository";
import { HealthHandler } from "../src/features/health/presentation/health.handler";

describe("GET /health", () => {
  it("returns ok status and database connectivity", async () => {
    const repository = new D1HealthRepository(env.DB);
    const useCase = new CheckHealthUseCase(repository);
    const app = createApp({ healthHandler: new HealthHandler(useCase) });
    const res = await app.request("/health", {}, env);

    expect(res.status).toBe(200);

    const body = await res.json<{
      status: string;
      checkedAt: string;
      database: string;
    }>();
    expect(body.status).toBe("ok");
    expect(body.database).toBe("ok");
    expect(() => new Date(body.checkedAt).toISOString()).not.toThrow();
  });

  it("uses the use case injected when the app is created", async () => {
    let calls = 0;
    const healthHandler = new HealthHandler({
      execute: async () => {
        calls += 1;
        return {
          status: "ok",
          checkedAt: "2026-09-17T00:00:00.000Z",
          database: "error",
        };
      },
    });
    const app = createApp({ healthHandler });

    const res = await app.request("/health", {}, env);

    expect(await res.json()).toEqual({
      status: "ok",
      checkedAt: "2026-09-17T00:00:00.000Z",
      database: "error",
    });
    expect(calls).toBe(1);
  });
});
