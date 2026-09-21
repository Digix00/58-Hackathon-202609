import { describe, expect, it, vi } from "vitest";

import {
  InvalidLineTokenError,
  LineAuthConfigurationError,
} from "../../src/application/port/line-token-verifier";
import { LineApiClient } from "../../src/infrastructure/line/line-api.client";

describe("LineApiClient", () => {
  it("sends the raw ID token to LINE and returns the verified subject", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      new Response(
        JSON.stringify({
          sub: "U123",
          iss: "https://access.line.me",
          aud: "channel-123",
          exp: Math.floor(Date.now() / 1000) + 60,
        }),
        { status: 200 },
      ),
    );
    const client = new LineApiClient("channel-123", fetcher);

    await expect(client.verify("raw-id-token")).resolves.toEqual({
      lineUserId: "U123",
    });

    const [url, init] = fetcher.mock.calls[0];
    if (!init) {
      throw new Error("fetch init was not captured");
    }
    expect(url).toBe("https://api.line.me/oauth2/v2.1/verify");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      "Content-Type": "application/x-www-form-urlencoded",
    });
    expect(init.body).toBeInstanceOf(URLSearchParams);
    expect((init.body as URLSearchParams).get("id_token")).toBe("raw-id-token");
    expect((init.body as URLSearchParams).get("client_id")).toBe("channel-123");
  });

  it("rejects a failed LINE verification without exposing the response body", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ error: "invalid token" }), { status: 400 }),
    );
    const client = new LineApiClient("channel-123", fetcher);

    await expect(client.verify("raw-id-token")).rejects.toBeInstanceOf(
      InvalidLineTokenError,
    );
  });

  it("fails clearly when the channel ID is not configured", async () => {
    const client = new LineApiClient(undefined, vi.fn());

    await expect(client.verify("raw-id-token")).rejects.toBeInstanceOf(
      LineAuthConfigurationError,
    );
  });
});
