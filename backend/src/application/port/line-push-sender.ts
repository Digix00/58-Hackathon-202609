import type { LineBroadcastResult } from "./line-broadcast-sender";

export type LinePushResult = LineBroadcastResult;

/** LINE Messaging API の Push API で、一人の友だちへメッセージを送る Port。 */
export interface LinePushSender {
  readonly deliveryMode: "line_api" | "simulation";
  isConfigured(): boolean;
  sendText(
    lineUserId: string,
    text: string,
    retryKey: string,
  ): Promise<LinePushResult>;
}
