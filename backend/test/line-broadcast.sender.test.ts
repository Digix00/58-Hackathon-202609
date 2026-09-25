import { describe, expect, it } from "vitest";

import { isLocalLineBroadcastSimulationEnabled } from "../src/bootstrap/container";
import { LineBroadcastApiSender } from "../src/infrastructure/line/line-broadcast.sender";
import { LocalLineBroadcastSender } from "../src/infrastructure/line/local-line-broadcast.sender";

it("enables the local simulation only when all local development flags are set", () => {
  expect(
    isLocalLineBroadcastSimulationEnabled({
      DEV_AUTH_ENABLED: "true",
      DEV_ACCESS_BYPASS: "true",
      DEV_LINE_BROADCAST_SIMULATION: "true",
    }),
  ).toBe(true);
  expect(
    isLocalLineBroadcastSimulationEnabled({
      DEV_AUTH_ENABLED: "true",
      DEV_ACCESS_BYPASS: "true",
    }),
  ).toBe(false);
  expect(
    isLocalLineBroadcastSimulationEnabled({
      DEV_AUTH_ENABLED: "true",
      DEV_LINE_BROADCAST_SIMULATION: "true",
    }),
  ).toBe(false);
});

it("simulates local broadcast without calling LINE", async () => {
  const sender = new LocalLineBroadcastSender();

  expect(sender.deliveryMode).toBe("simulation");
  expect(sender.isConfigured()).toBe(true);
  await expect(
    sender.sendDailyQuiz(
      "https://liff.line.me/1234567890-AbcdEfgh/quiz/today",
      "retry-key",
    ),
  ).resolves.toEqual({
    status: "accepted",
    httpStatus: 200,
    requestId: null,
    acceptedRequestId: null,
  });
});

describe("LineBroadcastApiSender", () => {
  it("treats a 409 with X-Line-Accepted-Request-Id as accepted and reuses the Retry Key", async () => {
    let request: Request | undefined;
    const sender = new LineBroadcastApiSender(
      "test-access-token",
      "1234567890-AbcdEfgh",
      async (input, init) => {
        request = new Request(input, init);
        return new Response(null, {
          status: 409,
          headers: { "X-Line-Accepted-Request-Id": "accepted-request-1" },
        });
      },
    );

    const result = await sender.sendDailyQuiz(
      "https://liff.line.me/1234567890-AbcdEfgh/quiz/today",
      "retry-key-1",
    );

    expect(result).toEqual({
      status: "accepted",
      httpStatus: 409,
      requestId: null,
      acceptedRequestId: "accepted-request-1",
    });
    expect(request?.url).toBe("https://api.line.me/v2/bot/message/broadcast");
    expect(request?.headers.get("x-line-retry-key")).toBe("retry-key-1");
    expect(request?.headers.get("authorization")).toBe(
      "Bearer test-access-token",
    );
    expect(await request?.json()).toEqual({
      messages: [
        {
          type: "text",
          text: "今日のクイズが届きました。\nhttps://liff.line.me/1234567890-AbcdEfgh/quiz/today",
        },
      ],
    });
  });

  it("does not configure LINE broadcast when the LIFF ID is invalid", () => {
    const sender = new LineBroadcastApiSender(
      "test-access-token",
      "invalid/liff-id",
    );
    expect(sender.isConfigured()).toBe(false);
  });
});
