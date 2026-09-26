import type { DisplayLanguage } from "../../util/display-language";
import { toTokyoDate } from "../shared/tokyo-date";

export type ReactionDigestTrigger = "cron" | "manual";

export type ReactionDigestRunStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "partially_failed"
  | "failed";

export type ReactionDigestDeliveryStatus =
  | "pending"
  | "started"
  | "sent"
  | "failed"
  | "skipped";

/** 寄りそい通知の状態遷移の不変条件に違反した場合のドメインエラー。 */
export class ReactionDigestStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReactionDigestStateError";
  }
}

/** 寄りそい通知の一回の実行（run）の状態。受信者や個人の集計値は含めない。 */
export interface ReactionDigestRun {
  runId: string;
  trigger: ReactionDigestTrigger;
  status: ReactionDigestRunStatus;
  cutoffAt: string;
  requestedAt: string;
  finishedAt: string | null;
  targetCount: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  remainingCount: number;
}

/**
 * run を実行したいという要求。
 * Cron は Asia/Tokyo の日付ごとの冪等キーで同じ日の run を一つに限る。
 * 手動は冪等キーを持たず、未完了の run があれば続きを、なければ新しい run を実行する。
 */
export class ReactionDigestRunRequest {
  readonly trigger: ReactionDigestTrigger;
  readonly idempotencyKey: string | null;
  /** 新しい run を作る場合に使う ID。未完了の run を再開する場合は使われない。 */
  readonly newRunId: string;
  readonly claimToken: string;
  readonly requestedAt: string;
  readonly leaseExpiresAt: string;

  private constructor(input: {
    trigger: ReactionDigestTrigger;
    idempotencyKey: string | null;
    newRunId: string;
    claimToken: string;
    requestedAt: Date;
    leaseMilliseconds: number;
  }) {
    if (!input.newRunId || !input.claimToken) {
      throw new ReactionDigestStateError("run ID and claim token are required");
    }
    if (
      !Number.isFinite(input.leaseMilliseconds) ||
      input.leaseMilliseconds <= 0
    ) {
      throw new ReactionDigestStateError("lease must be positive");
    }
    this.trigger = input.trigger;
    this.idempotencyKey = input.idempotencyKey;
    this.newRunId = input.newRunId;
    this.claimToken = input.claimToken;
    this.requestedAt = input.requestedAt.toISOString();
    this.leaseExpiresAt = new Date(
      input.requestedAt.getTime() + input.leaseMilliseconds,
    ).toISOString();
  }

  static scheduled(input: {
    scheduledAt: Date;
    newRunId: string;
    claimToken: string;
    requestedAt: Date;
    leaseMilliseconds: number;
  }): ReactionDigestRunRequest {
    return new ReactionDigestRunRequest({
      ...input,
      trigger: "cron",
      idempotencyKey: `reaction-digest:cron:${toTokyoDate(input.scheduledAt)}`,
    });
  }

  static manual(input: {
    newRunId: string;
    claimToken: string;
    requestedAt: Date;
    leaseMilliseconds: number;
  }): ReactionDigestRunRequest {
    return new ReactionDigestRunRequest({
      ...input,
      trigger: "manual",
      idempotencyKey: null,
    });
  }

  /** 新しい run を作る場合の冪等キー。手動 run は run ID ごとに一意にする。 */
  get newRunIdempotencyKey(): string {
    return (
      this.idempotencyKey ?? `reaction-digest:${this.trigger}:${this.newRunId}`
    );
  }
}

/** claim を取得した run。以降の永続化は、この claim を持つ runner だけが行える。 */
export class ClaimedReactionDigestRun {
  readonly run: ReactionDigestRun;
  readonly claimToken: string;

  constructor(run: ReactionDigestRun, claimToken: string) {
    if (run.status !== "running") {
      throw new ReactionDigestStateError("claimed run must be running");
    }
    if (!claimToken) {
      throw new ReactionDigestStateError("claim token is required");
    }
    this.run = run;
    this.claimToken = claimToken;
  }

  get runId(): string {
    return this.run.runId;
  }
}

export type ClaimReactionDigestRunResult =
  | { status: "claimed"; claimed: ClaimedReactionDigestRun }
  | { status: "in_progress"; run: ReactionDigestRun }
  | { status: "finished"; run: ReactionDigestRun };

/** メッセージに使う集計値。寄りそった人を特定できる情報は持たない。 */
export class ReactionDigestSummary {
  readonly reactorCount: number;
  readonly sameRegionCount: number;
  readonly regionCount: number;
  readonly regionCode: string | null;

  constructor(input: {
    reactorCount: number;
    sameRegionCount: number;
    regionCount: number;
    regionCode: string | null;
  }) {
    if (!Number.isInteger(input.reactorCount) || input.reactorCount < 1) {
      throw new RangeError("reactorCount must be a positive integer");
    }
    if (
      !Number.isInteger(input.sameRegionCount) ||
      input.sameRegionCount < 0 ||
      input.sameRegionCount > input.reactorCount
    ) {
      throw new RangeError("sameRegionCount is out of range");
    }
    if (
      !Number.isInteger(input.regionCount) ||
      input.regionCount < 0 ||
      input.regionCount > input.reactorCount
    ) {
      throw new RangeError("regionCount is out of range");
    }
    this.reactorCount = input.reactorCount;
    this.sameRegionCount = input.sameRegionCount;
    this.regionCount = input.regionCount;
    this.regionCode = input.regionCode;
  }

  /** 受信者が都道府県を設定しており、同じ都道府県の人から寄りそいが届いたか。 */
  get hasSameRegion(): boolean {
    return (
      this.regionCode !== null &&
      this.regionCode !== "no_answer" &&
      this.sameRegionCount > 0
    );
  }

  /**
   * 複数の都道府県から届いたか。1 つだけのときは地域を伝えない。
   * 寄りそった人が 1 人の場合に、その人の地域がわかりやすくなるのを避ける。
   */
  get hasMultipleRegions(): boolean {
    return this.regionCount >= 2;
  }
}

export interface ReactionDigestRecipient {
  lineUserId: string;
  displayLanguage: DisplayLanguage;
  /** 送信直前にも友だち状態を確認し、解除・削除済みなら送らない。 */
  isReachable: boolean;
}

/** LINE API の応答のうち、送信結果として保存する値。 */
export interface ReactionDigestPushResponse {
  httpStatus: number;
  requestId: string | null;
}

interface ReactionDigestDeliveryState {
  id: string;
  runId: string;
  status: ReactionDigestDeliveryStatus;
  /** 結果不明の再送では、前回保存した Retry Key を再利用する。 */
  retryKey: string | null;
  attemptedAt: string | null;
  sentAt: string | null;
  response: ReactionDigestPushResponse | null;
  errorCode: string | null;
  recipient: ReactionDigestRecipient;
  summary: ReactionDigestSummary;
}

/**
 * 受信者ごとの送信単位。集計値は run の締め時刻でスナップショットされる。
 * 状態は pending → started → sent / failed、または pending / started → skipped と遷移する。
 */
export class ReactionDigestDelivery {
  readonly id: string;
  readonly runId: string;
  readonly status: ReactionDigestDeliveryStatus;
  readonly retryKey: string | null;
  readonly attemptedAt: string | null;
  readonly sentAt: string | null;
  readonly response: ReactionDigestPushResponse | null;
  readonly errorCode: string | null;
  readonly recipient: ReactionDigestRecipient;
  readonly summary: ReactionDigestSummary;

  constructor(state: ReactionDigestDeliveryState) {
    if (state.status !== "pending" && state.status !== "skipped") {
      if (!state.retryKey) {
        throw new ReactionDigestStateError(
          "a started delivery must have a retry key",
        );
      }
    }
    if (
      (state.status === "sent" || state.status === "failed") &&
      !state.response
    ) {
      throw new ReactionDigestStateError(
        "a finished delivery must have a response",
      );
    }
    if (state.status === "failed" && !state.errorCode) {
      throw new ReactionDigestStateError(
        "a failed delivery must have an error code",
      );
    }
    this.id = state.id;
    this.runId = state.runId;
    this.status = state.status;
    this.retryKey = state.retryKey;
    this.attemptedAt = state.attemptedAt;
    this.sentAt = state.sentAt;
    this.response = state.response;
    this.errorCode = state.errorCode;
    this.recipient = state.recipient;
    this.summary = state.summary;
  }

  get isUnresolved(): boolean {
    return this.status === "pending" || this.status === "started";
  }

  /** 外部 API を呼ぶ前に Retry Key を確定する。再送では既存のキーを使い続ける。 */
  start(retryKey: string, attemptedAt: string): ReactionDigestDelivery {
    if (!this.isUnresolved) {
      throw new ReactionDigestStateError(
        `cannot start a ${this.status} delivery`,
      );
    }
    return this.with({
      status: "started",
      retryKey: this.retryKey ?? retryKey,
      attemptedAt,
    });
  }

  markSent(
    response: ReactionDigestPushResponse,
    sentAt: string,
  ): ReactionDigestDelivery {
    this.assertStarted();
    return this.with({ status: "sent", response, sentAt, errorCode: null });
  }

  markFailed(response: ReactionDigestPushResponse): ReactionDigestDelivery {
    this.assertStarted();
    return this.with({
      status: "failed",
      response,
      errorCode: pushErrorCode(response.httpStatus),
    });
  }

  /** 送信直前に友だち解除・削除済みだった受信者には送らない。 */
  skip(at: string): ReactionDigestDelivery {
    if (!this.isUnresolved) {
      throw new ReactionDigestStateError(
        `cannot skip a ${this.status} delivery`,
      );
    }
    return this.with({
      status: "skipped",
      attemptedAt: at,
      errorCode: "recipient_unreachable",
    });
  }

  private assertStarted(): void {
    if (this.status !== "started") {
      throw new ReactionDigestStateError(
        `cannot finish a ${this.status} delivery`,
      );
    }
  }

  private with(
    changes: Partial<ReactionDigestDeliveryState>,
  ): ReactionDigestDelivery {
    return new ReactionDigestDelivery({
      id: this.id,
      runId: this.runId,
      status: this.status,
      retryKey: this.retryKey,
      attemptedAt: this.attemptedAt,
      sentAt: this.sentAt,
      response: this.response,
      errorCode: this.errorCode,
      recipient: this.recipient,
      summary: this.summary,
      ...changes,
    });
  }
}

function pushErrorCode(httpStatus: number): string {
  if (httpStatus === 429) {
    return "rate_limited";
  }
  if (httpStatus >= 500) {
    return "upstream_unavailable";
  }
  return "upstream_rejected";
}
