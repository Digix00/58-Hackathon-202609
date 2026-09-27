import type {
  LinePushResult,
  LinePushSender,
} from "../../application/port/line-push-sender";

/** ローカル開発用。LINE APIへ接続せず、Push の受付だけを模擬する。 */
export class LocalLinePushSender implements LinePushSender {
  readonly deliveryMode = "simulation" as const;

  isConfigured(): boolean {
    return true;
  }

  async sendText(
    _lineUserId: string,
    _text: string,
    _retryKey: string,
  ): Promise<LinePushResult> {
    return {
      status: "accepted",
      httpStatus: 200,
      requestId: null,
      acceptedRequestId: null,
    };
  }
}
