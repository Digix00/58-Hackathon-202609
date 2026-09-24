import { describe, expect, it } from "vitest";

import { LineBroadcastApiSender } from "../src/infrastructure/line/line-broadcast.sender";

describe("LineBroadcastApiSender", () => {
  it("treats a 409 with X-Line-Accepted-Request-Id as accepted and reuses the Retry Key", async () => {
    let request: Request | undefined;
    const sender = new LineBroadcastApiSender(
      "test-access-token",
      "https://frontend.example",
      async (input, init) => {
        request = new Request(input, init);
        return new Response(null, {
          status: 409,
          headers: { "X-Line-Accepted-Request-Id": "accepted-request-1" },
        });
      },
    );

    const result = await sender.sendDailyQuiz(
      "https://frontend.example/quiz/today",
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
          text: "今日のクイズが届きました。\nhttps://frontend.example/quiz/today",
        },
      ],
    });
  });

  it("keeps browser URLs out of the message when the frontend origin is invalid", () => {
    const sender = new LineBroadcastApiSender(
      "test-access-token",
      "https://bad-origin.example/path",
    );
    expect(sender.isConfigured()).toBe(false);
  });
});
