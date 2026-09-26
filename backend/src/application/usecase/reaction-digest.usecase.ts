import type {
  ReactionDigestDelivery,
  ReactionDigestRun,
  ReactionDigestTrigger,
} from "../entity/reaction-digest.entity";
import type { LinePushResult, LinePushSender } from "../port/line-push-sender";
import type { ReactionDigestRepository } from "../repository/reaction-digest.repository";
import { generateId } from "../shared/id-generator";
import { createLiffUrl } from "../shared/liff-url";
import { buildReactionDigestMessage } from "../shared/reaction-digest-message";
import { toTokyoDate } from "../shared/tokyo-date";

export class ReactionDigestConfigurationError extends Error {
  constructor() {
    super("LINE reaction digest is not configured");
    this.name = "ReactionDigestConfigurationError";
  }
}

export const DEFAULT_REACTION_DIGEST_MAX_PER_RUN = 40;
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
}

/** 投稿者へ、前回の通知以降に届いた寄りそいを LINE で知らせる UseCase。 */
export class ReactionDigestUseCase {
  private readonly repository: ReactionDigestRepository;
  private readonly pushSender: LinePushSender;
  private readonly linkUrl: string | null;
  private readonly maxPerRun: number;
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
    this.repository = repository;
    this.pushSender = pushSender;
    // 自分の投稿への反応を見る画面ができるまでは、フィードのトップへ誘導する。
    this.linkUrl = createLiffUrl(liffId, "/");
    this.maxPerRun = options.maxPerRun ?? DEFAULT_REACTION_DIGEST_MAX_PER_RUN;
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
  ): Promise<ReactionDigestExecution> =>
    this.execute("cron", `reaction-digest:cron:${toTokyoDate(at)}`);

  /** 管理画面・内部 API から任意のタイミングで起動する。 */
  readonly runManual = async (): Promise<ReactionDigestExecution> =>
    this.execute("manual", null);

  private async execute(
    trigger: ReactionDigestTrigger,
    idempotencyKey: string | null,
  ): Promise<ReactionDigestExecution> {
    const linkUrl = this.linkUrl;
    if (!this.pushSender.isConfigured() || !linkUrl) {
      throw new ReactionDigestConfigurationError();
    }

    const now = this.now();
    const claimed = await this.repository.claimRun({
      trigger,
      idempotencyKey,
      newRunId: this.createId(),
      claimToken: this.createId(),
      now: now.toISOString(),
      leaseExpiresAt: new Date(
        now.getTime() + LEASE_MILLISECONDS,
      ).toISOString(),
    });
    if (claimed.status === "in_progress") {
      return { status: "in_progress", run: claimed.run };
    }
    if (claimed.status === "finished") {
      return { status: "finished", run: claimed.run };
    }

    const { runId } = claimed.run;
    const { claimToken } = claimed;
    await this.repository.prepareDeliveries(
      runId,
      claimToken,
      this.now().toISOString(),
    );
    const deliveries = await this.repository.listSendableDeliveries(
      runId,
      claimToken,
      this.maxPerRun,
    );
    for (const delivery of deliveries) {
      await this.sendDelivery(runId, claimToken, delivery, linkUrl);
    }

    const run = await this.repository.finishRun(
      runId,
      claimToken,
      this.now().toISOString(),
    );
    return {
      status: run.status === "pending" ? "pending" : "finished",
      run,
    };
  }

  private async sendDelivery(
    runId: string,
    claimToken: string,
    delivery: ReactionDigestDelivery,
    linkUrl: string,
  ): Promise<void> {
    const claim = { runId, claimToken, deliveryId: delivery.id };
    if (!delivery.recipient.isReachable) {
      await this.repository.skipDelivery({
        ...claim,
        finishedAt: this.now().toISOString(),
      });
      return;
    }

    const retryKey = delivery.retryKey ?? this.createId();
    const started = await this.repository.startDelivery({
      ...claim,
      retryKey,
      attemptedAt: this.now().toISOString(),
    });
    if (!started) {
      return;
    }

    const text = buildReactionDigestMessage(
      delivery.summary,
      delivery.recipient.displayLanguage,
      linkUrl,
    );
    let response: LinePushResult;
    try {
      response = await this.pushSender.sendText(
        delivery.recipient.lineUserId,
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

    const finishInput = {
      ...claim,
      httpStatus: response.httpStatus,
      requestId: response.requestId,
      finishedAt: this.now().toISOString(),
    };
    if (response.status === "accepted") {
      await this.repository.completeDelivery(finishInput);
      return;
    }
    await this.repository.failDelivery({
      ...finishInput,
      errorCode: pushErrorCode(response.httpStatus),
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
