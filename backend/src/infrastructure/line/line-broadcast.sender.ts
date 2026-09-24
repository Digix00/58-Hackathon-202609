import type {
  LineBroadcastResult,
  LineBroadcastSender,
} from "../../application/port/line-broadcast-sender";

const BROADCAST_ENDPOINT = "https://api.line.me/v2/bot/message/broadcast";

/** LINE Messaging API の全友だち向け Broadcast API Adapter。 */
export class LineBroadcastApiSender implements LineBroadcastSender {
  readonly deliveryMode = "line_api" as const;
  private readonly accessToken: string | undefined;
  private readonly quizUrl: string | undefined;
  private readonly fetcher: typeof fetch;

  constructor(
    accessToken: string | undefined,
    frontendUrl: string | undefined,
    fetcher: typeof fetch = fetch,
  ) {
    this.accessToken = accessToken;
    this.quizUrl = frontendUrl ? makeQuizUrl(frontendUrl) : undefined;
    this.fetcher = fetcher;
  }

  isConfigured(): boolean {
    return Boolean(this.accessToken && this.quizUrl);
  }

  async sendDailyQuiz(
    url: string,
    retryKey: string,
  ): Promise<LineBroadcastResult> {
    if (!this.accessToken || !this.quizUrl || url !== this.quizUrl) {
      return { status: "unknown" };
    }

    let response: Response;
    try {
      response = await this.fetcher(BROADCAST_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
          "X-Line-Retry-Key": retryKey,
        },
        body: JSON.stringify({
          messages: [
            {
              type: "text",
              text: `今日のクイズが届きました。\n${this.quizUrl}`,
            },
          ],
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      return { status: "unknown" };
    }

    const requestId = response.headers.get("x-line-request-id");
    const acceptedRequestId = response.headers.get(
      "x-line-accepted-request-id",
    );
    if (response.ok || (response.status === 409 && acceptedRequestId)) {
      return {
        status: "accepted",
        httpStatus: response.status,
        requestId,
        acceptedRequestId,
      };
    }

    return {
      status: "rejected",
      httpStatus: response.status,
      requestId,
      acceptedRequestId,
    };
  }
}

function makeQuizUrl(frontendUrl: string): string | undefined {
  try {
    const origin = new URL(frontendUrl);
    if (origin.pathname !== "/" || origin.search || origin.hash) {
      return undefined;
    }
    if (origin.protocol !== "https:" && origin.hostname !== "localhost") {
      return undefined;
    }
    return new URL("/quiz/today", origin).toString();
  } catch {
    return undefined;
  }
}
