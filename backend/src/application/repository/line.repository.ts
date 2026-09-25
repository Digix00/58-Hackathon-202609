import type {
  ClaimDailyBroadcastResult,
  DailyBroadcastView,
  LineWebhookEvent,
  LineWebhookEventStatus,
} from "../entity/line-integration.entity";

export interface ClaimDailyBroadcastInput {
  quizId: string;
  quizDate: string;
  now: string;
  broadcastId: string;
  claimToken: string;
  leaseExpiresAt: string;
  attemptId: string;
  retryKey: string;
}

export interface FinishDailyBroadcastInput {
  broadcastId: string;
  claimToken: string;
  attemptId: string;
  httpStatus: number;
  requestId: string | null;
  acceptedRequestId: string | null;
  finishedAt: string;
}

export interface FailDailyBroadcastInput extends FinishDailyBroadcastInput {
  errorCode: string;
}

export interface LineRepository {
  recordWebhookEvent(
    event: LineWebhookEvent,
    receivedAt: string,
    userId: string,
  ): Promise<LineWebhookEventStatus>;
  findDailyBroadcast(quizDate: string): Promise<DailyBroadcastView>;
  claimDailyBroadcast(
    input: ClaimDailyBroadcastInput,
  ): Promise<ClaimDailyBroadcastResult>;
  completeDailyBroadcast(input: FinishDailyBroadcastInput): Promise<void>;
  failDailyBroadcast(input: FailDailyBroadcastInput): Promise<void>;
  recordUncertainDailyBroadcast(
    input: Pick<
      FinishDailyBroadcastInput,
      "broadcastId" | "claimToken" | "attemptId"
    >,
  ): Promise<void>;
}
