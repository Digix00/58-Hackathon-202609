import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import app from "../src/index";

describe("GET /health", () => {
  it("returns ok status and database connectivity", async () => {
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
});
