import type {
  LineBroadcastResult,
  LineBroadcastSender,
} from "../../application/port/line-broadcast-sender";

/** ローカル開発用。LINE APIへ接続せず、配信受付だけを模擬する。 */
export class LocalLineBroadcastSender implements LineBroadcastSender {
  readonly deliveryMode = "simulation" as const;

  isConfigured(): boolean {
    return true;
  }

  async sendDailyQuiz(
    _url: string,
    _retryKey: string,
  ): Promise<LineBroadcastResult> {
    return {
      status: "accepted",
      httpStatus: 200,
      requestId: null,
      acceptedRequestId: null,
    };
  }
}
