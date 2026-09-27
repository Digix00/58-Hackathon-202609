import type {
  ClaimedReactionDigestRun,
  ClaimReactionDigestRunResult,
  ReactionDigestDelivery,
  ReactionDigestRun,
  ReactionDigestRunRequest,
} from "../entity/reaction-digest.entity";

/**
 * 寄りそい通知の run と delivery を永続化する Port。
 * claim を必要とする操作は ClaimedReactionDigestRun を受け取り、claim を失った runner の書き込みを無視する。
 */
export interface ReactionDigestRepository {
  claimRun(
    request: ReactionDigestRunRequest,
  ): Promise<ClaimReactionDigestRunResult>;
  /**
   * run の締め時刻までに届いた寄りそいを集計し、受信者ごとの delivery を作る。
   * 同じ run で二回呼ばれても作り直さない。
   */
  prepareDeliveries(
    claimed: ClaimedReactionDigestRun,
    preparedAt: string,
  ): Promise<void>;
  listSendableDeliveries(
    claimed: ClaimedReactionDigestRun,
    limit: number,
  ): Promise<ReactionDigestDelivery[]>;
  /**
   * 状態遷移後の delivery を保存する。遷移元の状態でなくなっていた場合や、
   * claim を失っていた場合は保存せず false を返す。
   */
  saveDelivery(
    claimed: ClaimedReactionDigestRun,
    delivery: ReactionDigestDelivery,
  ): Promise<boolean>;
  /** delivery の状態から run の状態を確定し、claim を解放する。 */
  finishRun(
    claimed: ClaimedReactionDigestRun,
    finishedAt: string,
  ): Promise<ReactionDigestRun>;
  findRecentRuns(limit: number): Promise<ReactionDigestRun[]>;
}
