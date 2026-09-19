import { describe, expect, it, vi } from "vitest";

import type { HealthRepository } from "../../../src/application/health.repository";
import { CheckHealthUseCase } from "../../../src/application/usecase/check-health.usecase";

describe("CheckHealthUseCase", () => {
  it.each([
    {
      scenario: "reports a successful repository ping",
      ping: async () => undefined,
      database: "ok",
    },
    {
      scenario: "reports a database error without leaking infrastructure errors",
      ping: async () => {
        throw new Error("database unavailable");
      },
      database: "error",
    },
  ] as const)("$scenario", async ({ ping, database }) => {
    const repository: HealthRepository = { ping: vi.fn(ping) };
    const checkHealth = new CheckHealthUseCase(
      repository,
      () => new Date("2026-09-17T00:00:00.000Z"),
    );

    await expect(checkHealth.execute()).resolves.toEqual({
      status: "ok",
      checkedAt: "2026-09-17T00:00:00.000Z",
      database,
    });
    expect(repository.ping).toHaveBeenCalledOnce();
  });
});
