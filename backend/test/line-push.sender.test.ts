import { describe, expect, it } from "vitest";

import { LinePushApiSender } from "../src/infrastructure/line/line-push.sender";
import { LocalLinePushSender } from "../src/infrastructure/line/local-line-push.sender";

it("simulates local push without calling LINE", async () => {
  const sender = new LocalLinePushSender();

  expect(sender.deliveryMode).toBe("simulation");
  expect(sender.isConfigured()).toBe(true);
  await expect(
    sender.sendText("line-user", "text", "retry-key"),
  ).resolves.toEqual({
    status: "accepted",
    httpStatus: 200,
    requestId: null,
    acceptedRequestId: null,
  });
});

describe("LinePushApiSender", () => {
  it("sends a text push with the Retry Key and treats 409 with an accepted id as accepted", async () => {
    let request: Request | undefined;
    const sender = new LinePushApiSender(
      "test-access-token",
      async (input, init) => {
        request = new Request(input, init);
        return new Response(null, {
          status: 409,
          headers: { "X-Line-Accepted-Request-Id": "accepted-request-1" },
        });
      },
    );

    const result = await sender.sendText("U123", "こんにちは", "retry-key-1");

    expect(result).toEqual({
      status: "accepted",
      httpStatus: 409,
      requestId: null,
      acceptedRequestId: "accepted-request-1",
    });
    expect(request?.url).toBe("https://api.line.me/v2/bot/message/push");
    expect(request?.headers.get("x-line-retry-key")).toBe("retry-key-1");
    expect(request?.headers.get("authorization")).toBe(
      "Bearer test-access-token",
    );
    expect(await request?.json()).toEqual({
      to: "U123",
      messages: [{ type: "text", text: "こんにちは" }],
    });
  });

  it("reports rejected pushes and unknown results", async () => {
    const rejected = new LinePushApiSender(
      "test-access-token",
      async () =>
        new Response(null, {
          status: 400,
          headers: { "X-Line-Request-Id": "request-1" },
        }),
    );
    await expect(rejected.sendText("U123", "text", "key")).resolves.toEqual({
      status: "rejected",
      httpStatus: 400,
      requestId: "request-1",
      acceptedRequestId: null,
    });

    const failing = new LinePushApiSender("test-access-token", async () => {
      throw new TypeError("network down");
    });
    await expect(failing.sendText("U123", "text", "key")).resolves.toEqual({
      status: "unknown",
    });

    const unconfigured = new LinePushApiSender(undefined);
    expect(unconfigured.isConfigured()).toBe(false);
  });
});
