import { describe, expect, it, vi } from "vitest";

import type { HealthRepository } from "../../../src/features/health/application/health.repository";
import { CheckHealthUseCase } from "../../../src/features/health/application/check-health.usecase";

describe("checkHealth", () => {
  it("reports a successful repository ping", async () => {
    const repository: HealthRepository = { ping: vi.fn().mockResolvedValue(undefined) };
    const checkHealth = new CheckHealthUseCase(
      repository,
      () => new Date("2026-09-17T00:00:00.000Z"),
    );

    await expect(checkHealth.execute()).resolves.toEqual({
      status: "ok",
      checkedAt: "2026-09-17T00:00:00.000Z",
      database: "ok",
    });
    expect(repository.ping).toHaveBeenCalledOnce();
  });

  it("reports a database error without leaking infrastructure errors", async () => {
    const repository: HealthRepository = {
      ping: vi.fn().mockRejectedValue(new Error("database unavailable")),
    };
    const checkHealth = new CheckHealthUseCase(repository);

    await expect(checkHealth.execute()).resolves.toMatchObject({
      status: "ok",
      database: "error",
    });
  });
});
