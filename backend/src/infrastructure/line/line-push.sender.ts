import type {
  LinePushResult,
  LinePushSender,
} from "../../application/port/line-push-sender";

const PUSH_ENDPOINT = "https://api.line.me/v2/bot/message/push";

/** LINE Messaging API の Push API Adapter。一人の友だちへメッセージを送る。 */
export class LinePushApiSender implements LinePushSender {
  readonly deliveryMode = "line_api" as const;
  private readonly accessToken: string | undefined;
  private readonly fetcher: typeof fetch;

  constructor(accessToken: string | undefined, fetcher: typeof fetch = fetch) {
    this.accessToken = accessToken;
    this.fetcher = fetcher;
  }

  isConfigured(): boolean {
    return Boolean(this.accessToken);
  }

  async sendText(
    lineUserId: string,
    text: string,
    retryKey: string,
  ): Promise<LinePushResult> {
    if (!this.accessToken) {
      return { status: "unknown" };
    }

    let response: Response;
    try {
      // globalThisをthisとして渡さないとネイティブfetchが
      // Illegal invocationで例外を投げる(this.fetcher(...)はメソッド呼び出し扱いになるため)。
      response = await this.fetcher.call(globalThis, PUSH_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
          "X-Line-Retry-Key": retryKey,
        },
        body: JSON.stringify({
          to: lineUserId,
          messages: [{ type: "text", text }],
        }),
        signal: AbortSignal.timeout(5_000),
      });
    } catch (error) {
      // 宛先の LINE user ID と本文はログへ出さない。
      console.error(
        JSON.stringify({
          severity: "ERROR",
          message: "line push request failed",
          error: error instanceof Error ? error.name : "unknown",
        }),
      );
      return { status: "unknown" };
    }

    const requestId = response.headers.get("x-line-request-id");
    const acceptedRequestId = response.headers.get(
      "x-line-accepted-request-id",
    );
    // 409 + X-Line-Accepted-Request-Id は、同じ Retry Key の先行リクエストが受理済みであることを示す。
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
