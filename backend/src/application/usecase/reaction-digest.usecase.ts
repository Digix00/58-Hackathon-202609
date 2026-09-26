import {
  type ClaimedReactionDigestRun,
  type ReactionDigestDelivery,
  type ReactionDigestRun,
  ReactionDigestRunRequest,
} from "../entity/reaction-digest.entity";
import type { LinePushResult, LinePushSender } from "../port/line-push-sender";
import type { ReactionDigestRepository } from "../repository/reaction-digest.repository";
import { generateId } from "../shared/id-generator";
import { createLiffUrl } from "../shared/liff-url";
import { buildReactionDigestMessage } from "../shared/reaction-digest-message";

export class ReactionDigestConfigurationError extends Error {
  constructor() {
    super("LINE reaction digest is not configured");
    this.name = "ReactionDigestConfigurationError";
  }
}

export const DEFAULT_REACTION_DIGEST_MAX_PER_RUN = 40;

/**
 * 手動実行が送信に使う時間の上限。
 * 管理画面は POST の応答を待つので、maxPerRun を増やしても応答時間が伸び続けないようにする。
 * 上限に達したら残りは 202 として返し、「残りを送る」で続きを送る。
 * Cron には適用しない（待っている画面が無く、1 日 1 回で送り切りたいため）。
 */
export const DEFAULT_REACTION_DIGEST_MANUAL_BUDGET_MILLISECONDS = 20_000;

const LEASE_MILLISECONDS = 5 * 60_000;
const RECENT_RUN_LIMIT = 10;

export interface ReactionDigestExecution {
  /**
   * finished: run のすべての delivery が確定した。
   * pending: 上限件数や結果不明の送信が残っており、次の実行で続きを送る。
   * in_progress: 別の runner が同じ run を実行中。
   */
  status: "finished" | "pending" | "in_progress";
  run: ReactionDigestRun;
}

export interface ReactionDigestOptions {
  maxPerRun?: number;
  /** 手動実行が送信に使う時間の上限（ミリ秒）。 */
  manualBudgetMilliseconds?: number;
}

/** 投稿者へ、前回の通知以降に届いた寄りそいを LINE で知らせる UseCase。 */
export class ReactionDigestUseCase {
  private readonly repository: ReactionDigestRepository;
  private readonly pushSender: LinePushSender;
  private readonly linkUrl: string | null;
  private readonly maxPerRun: number;
  private readonly manualBudgetMilliseconds: number;
  private readonly now: () => Date;
  private readonly createId: () => string;

  constructor(
    repository: ReactionDigestRepository,
    pushSender: LinePushSender,
    liffId: string | undefined,
    options: ReactionDigestOptions = {},
    now: () => Date = () => new Date(),
    createId: () => string = generateId,
  ) {
    const maxPerRun = options.maxPerRun ?? DEFAULT_REACTION_DIGEST_MAX_PER_RUN;
    // 送信件数は SQL の LIMIT へ渡すため、正の整数だけを受け付ける。
    if (!Number.isInteger(maxPerRun) || maxPerRun < 1) {
      throw new RangeError("maxPerRun must be a positive integer");
    }
    const manualBudgetMilliseconds =
      options.manualBudgetMilliseconds ??
      DEFAULT_REACTION_DIGEST_MANUAL_BUDGET_MILLISECONDS;
    if (
      !Number.isFinite(manualBudgetMilliseconds) ||
      manualBudgetMilliseconds <= 0
    ) {
      throw new RangeError("manualBudgetMilliseconds must be positive");
    }

    this.repository = repository;
    this.pushSender = pushSender;
    // 自分の投稿への反応を見る画面ができるまでは、フィードのトップへ誘導する。
    this.linkUrl = createLiffUrl(liffId, "/");
    this.maxPerRun = maxPerRun;
    this.manualBudgetMilliseconds = manualBudgetMilliseconds;
    this.now = now;
    this.createId = createId;
  }

  get deliveryMode(): LinePushSender["deliveryMode"] {
    return this.pushSender.deliveryMode;
  }

  readonly getRecentRuns = async (): Promise<ReactionDigestRun[]> =>
    this.repository.findRecentRuns(RECENT_RUN_LIMIT);

  /** Cron から 1 日 1 回起動する。同じ日付の run は一つだけ作る。 */
  readonly runScheduled = async (
    at: Date = this.now(),
  ): Promise<ReactionDigestExecution> => {
    const linkUrl = this.requireLinkUrl();
    return this.execute(
      linkUrl,
      ReactionDigestRunRequest.scheduled({
        scheduledAt: at,
        newRunId: this.createId(),
        claimToken: this.createId(),
        requestedAt: this.now(),
        leaseMilliseconds: LEASE_MILLISECONDS,
      }),
      null,
    );
  };

  /** 管理画面・内部 API から任意のタイミングで起動する。 */
  readonly runManual = async (): Promise<ReactionDigestExecution> => {
    const linkUrl = this.requireLinkUrl();
    return this.execute(
      linkUrl,
      ReactionDigestRunRequest.manual({
        newRunId: this.createId(),
        claimToken: this.createId(),
        requestedAt: this.now(),
        leaseMilliseconds: LEASE_MILLISECONDS,
      }),
      this.manualBudgetMilliseconds,
    );
  };

  private requireLinkUrl(): string {
    if (!this.pushSender.isConfigured() || !this.linkUrl) {
      throw new ReactionDigestConfigurationError();
    }
    return this.linkUrl;
  }

  /**
   * budgetMilliseconds に時間の上限を渡すと、そこまで送って残りを次の実行へ回す。
   * null なら maxPerRun まで送り切る。
   */
  private async execute(
    linkUrl: string,
    request: ReactionDigestRunRequest,
    budgetMilliseconds: number | null,
  ): Promise<ReactionDigestExecution> {
    const claimResult = await this.repository.claimRun(request);
    if (claimResult.status !== "claimed") {
      return claimResult;
    }

    const { claimed } = claimResult;
    await this.repository.prepareDeliveries(claimed, this.now().toISOString());
    const deliveries = await this.repository.listSendableDeliveries(
      claimed,
      this.maxPerRun,
    );
    const startedAt = this.now().getTime();
    for (const [index, delivery] of deliveries.entries()) {
      // 1 件目は必ず送る。以降は上限を超えた時点で打ち切り、残りは pending として残す。
      if (
        index > 0 &&
        budgetMilliseconds !== null &&
        this.now().getTime() - startedAt >= budgetMilliseconds
      ) {
        break;
      }
      await this.sendDelivery(claimed, delivery, linkUrl);
    }

    const run = await this.repository.finishRun(
      claimed,
      this.now().toISOString(),
    );
    return {
      status: run.status === "pending" ? "pending" : "finished",
      run,
    };
  }

  private async sendDelivery(
    claimed: ClaimedReactionDigestRun,
    delivery: ReactionDigestDelivery,
    linkUrl: string,
  ): Promise<void> {
    if (!delivery.recipient.isReachable) {
      await this.repository.saveDelivery(
        claimed,
        delivery.skip(this.now().toISOString()),
      );
      return;
    }

    // 結果不明で残った delivery は、保存済みの Retry Key で再送する。
    const retryKey = delivery.retryKey ?? this.createId();
    const started = delivery.start(retryKey, this.now().toISOString());
    if (!(await this.repository.saveDelivery(claimed, started))) {
      return;
    }

    const text = buildReactionDigestMessage(
      started.summary,
      started.recipient.displayLanguage,
      linkUrl,
    );
    let response: LinePushResult;
    try {
      response = await this.pushSender.sendText(
        started.recipient.lineUserId,
        text,
        retryKey,
      );
    } catch {
      response = { status: "unknown" };
    }

    // 結果不明の場合は started のまま残し、次の実行で同じ Retry Key を使って再送する。
    if (response.status === "unknown") {
      return;
    }

    const pushResponse = {
      httpStatus: response.httpStatus,
      requestId: response.requestId,
    };
    await this.repository.saveDelivery(
      claimed,
      response.status === "accepted"
        ? started.markSent(pushResponse, this.now().toISOString())
        : started.markFailed(pushResponse),
    );
  }
}
