import type { DisplayLanguage } from "../../util/display-language";

export type ReactionDigestTrigger = "cron" | "manual";

export type ReactionDigestRunStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "partially_failed"
  | "failed";

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

/** 受信者ごとの送信単位。集計値は run の締め時刻でスナップショットされる。 */
export interface ReactionDigestDelivery {
  id: string;
  status: "pending" | "started";
  /** 結果不明の再送では、前回保存した Retry Key を再利用する。 */
  retryKey: string | null;
  recipient: {
    lineUserId: string;
    displayLanguage: DisplayLanguage;
    /** 送信直前にも友だち状態を確認し、解除・削除済みなら送らない。 */
    isReachable: boolean;
  };
  summary: ReactionDigestSummary;
}

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

export type ClaimReactionDigestRunResult =
  | { status: "claimed"; run: ReactionDigestRun; claimToken: string }
  | { status: "in_progress"; run: ReactionDigestRun }
  | { status: "finished"; run: ReactionDigestRun };
