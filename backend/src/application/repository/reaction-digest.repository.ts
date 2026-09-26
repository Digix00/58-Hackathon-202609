import type {
  ClaimReactionDigestRunResult,
  ReactionDigestDelivery,
  ReactionDigestRun,
  ReactionDigestTrigger,
} from "../entity/reaction-digest.entity";

export interface ClaimReactionDigestRunInput {
  trigger: ReactionDigestTrigger;
  /**
   * Cron は日付ごとのキーを渡し、同じ日の run を一つに限る。
   * 手動実行は null を渡し、未完了の run があれば続きを、なければ新しい run を claim する。
   */
  idempotencyKey: string | null;
  newRunId: string;
  claimToken: string;
  now: string;
  leaseExpiresAt: string;
}

export interface DeliveryClaim {
  runId: string;
  claimToken: string;
  deliveryId: string;
}

export interface FinishDeliveryInput extends DeliveryClaim {
  httpStatus: number;
  requestId: string | null;
  finishedAt: string;
}

export interface ReactionDigestRepository {
  claimRun(
    input: ClaimReactionDigestRunInput,
  ): Promise<ClaimReactionDigestRunResult>;
  /**
   * run の締め時刻までに届いた寄りそいを集計し、受信者ごとの delivery を作る。
   * 同じ run で二回呼ばれても作り直さない。
   */
  prepareDeliveries(
    runId: string,
    claimToken: string,
    now: string,
  ): Promise<void>;
  listSendableDeliveries(
    runId: string,
    claimToken: string,
    limit: number,
  ): Promise<ReactionDigestDelivery[]>;
  /** 外部 API を呼ぶ前に Retry Key を保存する。claim を失っていれば false。 */
  startDelivery(
    input: DeliveryClaim & { retryKey: string; attemptedAt: string },
  ): Promise<boolean>;
  completeDelivery(input: FinishDeliveryInput): Promise<void>;
  failDelivery(
    input: FinishDeliveryInput & { errorCode: string },
  ): Promise<void>;
  skipDelivery(input: DeliveryClaim & { finishedAt: string }): Promise<void>;
  /** delivery の状態から run の集計値と状態を確定し、claim を解放する。 */
  finishRun(
    runId: string,
    claimToken: string,
    now: string,
  ): Promise<ReactionDigestRun>;
  findRecentRuns(limit: number): Promise<ReactionDigestRun[]>;
}
