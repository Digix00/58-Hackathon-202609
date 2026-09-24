export type LineBroadcastResult =
  | {
      status: "accepted";
      httpStatus: number;
      requestId: string | null;
      acceptedRequestId: string | null;
    }
  | {
      status: "rejected";
      httpStatus: number;
      requestId: string | null;
      acceptedRequestId: string | null;
    }
  | { status: "unknown" };

export interface LineBroadcastSender {
  isConfigured(): boolean;
  sendDailyQuiz(url: string, retryKey: string): Promise<LineBroadcastResult>;
}
