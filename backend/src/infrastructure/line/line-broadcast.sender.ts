import type {
  LineBroadcastResult,
  LineBroadcastSender,
} from "../../application/port/line-broadcast-sender";
import { createDailyQuizLiffUrl } from "../../application/shared/daily-quiz-liff-url";

const BROADCAST_ENDPOINT = "https://api.line.me/v2/bot/message/broadcast";

/** LINE Messaging API の全友だち向け Broadcast API Adapter。 */
export class LineBroadcastApiSender implements LineBroadcastSender {
  readonly deliveryMode = "line_api" as const;
  private readonly accessToken: string | undefined;
  private readonly quizUrl: string | undefined;
  private readonly fetcher: typeof fetch;

  constructor(
    accessToken: string | undefined,
    liffId: string | undefined,
    fetcher: typeof fetch = fetch,
  ) {
    this.accessToken = accessToken;
    this.quizUrl = createDailyQuizLiffUrl(liffId) ?? undefined;
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
      // globalThisをthisとして渡さないとネイティブfetchが
      // Illegal invocationで例外を投げる(this.fetcher(...)はメソッド呼び出し扱いになるため)。
      response = await this.fetcher.call(globalThis, BROADCAST_ENDPOINT, {
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
    } catch (error) {
      console.error(
        JSON.stringify({
          severity: "ERROR",
          message: "line broadcast request failed",
          error:
            error instanceof Error
              ? `${error.name}: ${error.message}`
              : String(error),
        }),
      );
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
