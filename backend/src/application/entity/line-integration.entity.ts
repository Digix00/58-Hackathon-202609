export type LineWebhookEventStatus = "processed" | "ignored" | "duplicate";

export interface LineWebhookEvent {
  webhookEventId: string;
  eventType: string;
  sourceType: string | null;
  lineUserId: string | null;
}

export type DailyBroadcastStatus =
  | "not_started"
  | "pending"
  | "running"
  | "succeeded"
  | "failed";

export interface DailyBroadcastView {
  quizDate: string;
  quizId: string | null;
  quizStatus: "missing" | "published";
  broadcastStatus: DailyBroadcastStatus;
  requestedAt: string | null;
  sentAt: string | null;
  finishedAt: string | null;
}

export interface LineBroadcastAttempt {
  id: string;
  attemptNumber: number;
  retryKey: string;
}

export type ClaimDailyBroadcastResult =
  | {
      status: "claimed";
      broadcastId: string;
      claimToken: string;
      attempt: LineBroadcastAttempt;
    }
  | { status: "succeeded"; broadcastId: string; view: DailyBroadcastView }
  | { status: "in_progress"; broadcastId: string; view: DailyBroadcastView }
  | { status: "not_available" };
