import {
  and,
  asc,
  count,
  countDistinct,
  desc,
  eq,
  exists,
  gt,
  inArray,
  isNull,
  lte,
  ne,
  notExists,
  notInArray,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { alias, type SQLiteUpdateSetSource } from "drizzle-orm/sqlite-core";

import {
  ClaimedReactionDigestRun,
  type ClaimReactionDigestRunResult,
  ReactionDigestDelivery,
  type ReactionDigestDeliveryStatus,
  type ReactionDigestRun,
  type ReactionDigestRunRequest,
  type ReactionDigestRunStatus,
  ReactionDigestSummary,
  type ReactionDigestTrigger,
} from "../../application/entity/reaction-digest.entity";
import type { ReactionDigestRepository } from "../../application/repository/reaction-digest.repository";
import {
  DISPLAY_LANGUAGES,
  type DisplayLanguage,
} from "../../util/display-language";
import {
  concernReactions,
  concerns,
  reactionDigestDeliveries,
  reactionDigestRuns,
  users,
} from "./schema";

/** まだ結果が確定していない run。手動実行はこの run の続きを送る。 */
const UNFINISHED_RUN_STATUSES = ["pending", "running"] as const;

/** まだ送信結果が確定していない delivery。 */
const UNRESOLVED_DELIVERY_STATUSES: readonly ReactionDigestDeliveryStatus[] = [
  "pending",
  "started",
];

/**
 * 手動実行で run を決めるまでの試行回数。
 * 「作れなかったのに未完了 run もない」のは、条件付き INSERT の直後に
 * 他の runner が完了した場合だけなので、もう一度作りに行けば決まる。
 */
const MANUAL_RUN_ATTEMPTS = 2;

/**
 * 起点を戻す幅。
 * concern_reactions.created_at はアプリ側で採番するため、採番から書き込みが見えるまでに間がある。
 * その間に集計が走ると、締め時刻より前の created_at を持つ寄りそいが集計の後にコミットされ、
 * 起点が締め時刻まで進むことで次回以降も対象から外れてしまう。
 * 起点をこの幅だけ戻し、集計と同時にコミットされた寄りそいを次の実行で拾う。
 * 同じ寄りそいを二度数える可能性はあるが、届いた寄りそいを知らせないほうが損失が大きい。
 */
const WINDOW_START_MARGIN_SECONDS = 5;

/** 条件に合う delivery の件数。left join なので、delivery が無い run でも 0 を返す。 */
function countDeliveriesWhere(condition: SQL): SQL<number> {
  return sql<number>`coalesce(sum(${condition}), 0)`.mapWith(Number);
}

// run の件数は delivery から毎回集計し、run 側に二重に持たない。
const RUN_COLUMNS = {
  runId: reactionDigestRuns.id,
  trigger: reactionDigestRuns.trigger,
  status: reactionDigestRuns.status,
  claimToken: reactionDigestRuns.claimToken,
  cutoffAt: reactionDigestRuns.cutoffAt,
  requestedAt: reactionDigestRuns.requestedAt,
  finishedAt: reactionDigestRuns.finishedAt,
  targetCount: count(reactionDigestDeliveries.id),
  sentCount: countDeliveriesWhere(eq(reactionDigestDeliveries.status, "sent")),
  failedCount: countDeliveriesWhere(
    eq(reactionDigestDeliveries.status, "failed"),
  ),
  skippedCount: countDeliveriesWhere(
    eq(reactionDigestDeliveries.status, "skipped"),
  ),
  remainingCount: countDeliveriesWhere(
    inArray(reactionDigestDeliveries.status, [...UNRESOLVED_DELIVERY_STATUSES]),
  ),
};

type RunRow = {
  runId: string;
  trigger: string;
  status: string;
  claimToken: string | null;
  cutoffAt: string;
  requestedAt: string;
  finishedAt: string | null;
  targetCount: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  remainingCount: number;
};

type DeliveryRow = {
  id: string;
  runId: string;
  status: string;
  retryKey: string | null;
  attemptedAt: string | null;
  reactorCount: number;
  sameRegionCount: number;
  regionCount: number;
  regionCodeSnapshot: string | null;
  lineUserId: string;
  displayLanguage: string;
  isReachable: number;
};

/**
 * 寄りそい通知の run と受信者ごとの delivery を D1 へ保存する Adapter。
 * 集計と重複防止は一つの SQL 文に収める必要があるため、
 * クエリビルダで表せない部分だけ drizzle の sql テンプレートで組む。
 */
export class D1ReactionDigestRepository implements ReactionDigestRepository {
  private readonly db: ReturnType<typeof drizzle>;

  constructor(database: D1Database) {
    this.db = drizzle(database);
  }

  async claimRun(
    request: ReactionDigestRunRequest,
  ): Promise<ClaimReactionDigestRunResult> {
    const runId = await this.findOrCreateTargetRun(request);

    await this.db
      .update(reactionDigestRuns)
      .set({
        status: "running",
        claimToken: request.claimToken,
        leaseExpiresAt: request.leaseExpiresAt,
      })
      .where(
        and(
          eq(reactionDigestRuns.id, runId),
          or(
            eq(reactionDigestRuns.status, "pending"),
            // lease が切れた run は、前の runner が落ちたものとして引き継ぐ。
            and(
              eq(reactionDigestRuns.status, "running"),
              lte(reactionDigestRuns.leaseExpiresAt, request.requestedAt),
            ),
          ),
        ),
      )
      .run();

    const row = await this.findRunRow(runId);
    if (!row) {
      throw new Error("reaction digest run disappeared after claim");
    }
    const run = toRun(row);
    if (row.claimToken === request.claimToken) {
      return {
        status: "claimed",
        claimed: new ClaimedReactionDigestRun(run, request.claimToken),
      };
    }
    if (row.status === "running") {
      return { status: "in_progress", run };
    }
    return { status: "finished", run };
  }

  async prepareDeliveries(
    claimed: ClaimedReactionDigestRun,
    preparedAt: string,
  ): Promise<void> {
    const { runId, claimToken } = claimed;
    const aggregate = this.recipientAggregate(runId);
    const notPrepared = and(
      eq(reactionDigestRuns.id, runId),
      eq(reactionDigestRuns.claimToken, claimToken),
      eq(reactionDigestRuns.status, "running"),
      isNull(reactionDigestRuns.deliveriesPreparedAt),
    );

    await this.db.batch([
      this.db
        .insert(reactionDigestDeliveries)
        // insert の列は drizzle がスキーマ宣言順に並べるため、select も同じ順にする。
        .select(
          this.db
            .select({
              id: sql`lower(hex(randomblob(16)))`.as("id"),
              runId: reactionDigestRuns.id,
              userId: aggregate.userId,
              windowStart: aggregate.windowStart,
              windowEnd: reactionDigestRuns.cutoffAt,
              reactorCount: aggregate.reactorCount,
              sameRegionCount: aggregate.sameRegionCount,
              regionCount: aggregate.regionCount,
              regionCodeSnapshot: aggregate.regionCode,
              status: sql`'pending'`.as("status"),
              lineRetryKey: sql`null`.as("line_retry_key"),
              httpStatus: sql`null`.as("http_status"),
              lineRequestId: sql`null`.as("line_request_id"),
              createdAt: sql`${preparedAt}`.as("created_at"),
              attemptedAt: sql`null`.as("attempted_at"),
              sentAt: sql`null`.as("sent_at"),
              errorCode: sql`null`.as("error_code"),
            })
            .from(reactionDigestRuns)
            .crossJoin(aggregate)
            .where(notPrepared),
        )
        .onConflictDoNothing(),
      this.db
        .update(reactionDigestRuns)
        .set({ deliveriesPreparedAt: preparedAt })
        .where(notPrepared),
    ]);
  }

  async listSendableDeliveries(
    claimed: ClaimedReactionDigestRun,
    limit: number,
  ): Promise<ReactionDigestDelivery[]> {
    const { runId, claimToken } = claimed;
    const rows = await this.db
      .select({
        id: reactionDigestDeliveries.id,
        runId: reactionDigestDeliveries.runId,
        status: reactionDigestDeliveries.status,
        retryKey: reactionDigestDeliveries.lineRetryKey,
        attemptedAt: reactionDigestDeliveries.attemptedAt,
        reactorCount: reactionDigestDeliveries.reactorCount,
        sameRegionCount: reactionDigestDeliveries.sameRegionCount,
        regionCount: reactionDigestDeliveries.regionCount,
        regionCodeSnapshot: reactionDigestDeliveries.regionCodeSnapshot,
        lineUserId: users.lineUserId,
        displayLanguage: users.displayLanguage,
        // 送信直前にも友だち状態を確認し、解除・削除済みなら送らない。
        isReachable: sql<number>`(
          ${eq(users.friendStatus, "active")} and ${isNull(users.deletedAt)}
        )`.mapWith(Number),
      })
      .from(reactionDigestDeliveries)
      .innerJoin(users, eq(users.id, reactionDigestDeliveries.userId))
      .where(
        and(
          eq(reactionDigestDeliveries.runId, runId),
          inArray(reactionDigestDeliveries.status, [
            ...UNRESOLVED_DELIVERY_STATUSES,
          ]),
          this.hasCurrentClaim(runId, claimToken),
        ),
      )
      .orderBy(
        asc(reactionDigestDeliveries.createdAt),
        asc(reactionDigestDeliveries.id),
      )
      .limit(limit)
      .all();

    return rows.map(toDelivery);
  }

  async saveDelivery(
    claimed: ClaimedReactionDigestRun,
    delivery: ReactionDigestDelivery,
  ): Promise<boolean> {
    if (delivery.runId !== claimed.runId) {
      return false;
    }
    const transition = deliveryTransition(delivery);
    if (!transition) {
      return false;
    }
    const result = await this.db
      .update(reactionDigestDeliveries)
      .set(transition.set)
      .where(
        and(
          eq(reactionDigestDeliveries.id, delivery.id),
          eq(reactionDigestDeliveries.runId, claimed.runId),
          inArray(reactionDigestDeliveries.status, [...transition.from]),
          this.hasCurrentClaim(claimed.runId, claimed.claimToken),
        ),
      )
      .run();
    return result.meta.changes > 0;
  }

  async finishRun(
    claimed: ClaimedReactionDigestRun,
    finishedAt: string,
  ): Promise<ReactionDigestRun> {
    const { runId, claimToken } = claimed;
    await this.db
      .update(reactionDigestRuns)
      .set({
        status: runStatusFromDeliveries(),
        claimToken: null,
        leaseExpiresAt: null,
      })
      .where(
        and(
          eq(reactionDigestRuns.id, runId),
          eq(reactionDigestRuns.claimToken, claimToken),
          eq(reactionDigestRuns.status, "running"),
        ),
      )
      .run();
    await this.db
      .update(reactionDigestRuns)
      .set({ finishedAt })
      .where(
        and(
          eq(reactionDigestRuns.id, runId),
          notInArray(reactionDigestRuns.status, [...UNFINISHED_RUN_STATUSES]),
          isNull(reactionDigestRuns.finishedAt),
        ),
      )
      .run();

    const row = await this.findRunRow(runId);
    if (!row) {
      throw new Error("reaction digest run not found");
    }
    return toRun(row);
  }

  async findRecentRuns(limit: number): Promise<ReactionDigestRun[]> {
    const rows = await this.runQuery()
      .groupBy(reactionDigestRuns.id)
      .orderBy(
        desc(reactionDigestRuns.requestedAt),
        desc(reactionDigestRuns.id),
      )
      .limit(limit)
      .all();
    return rows.map(toRun);
  }

  /**
   * 受信者ごとの集計。起点は「最後に送信成功した delivery の締め時刻」を
   * WINDOW_START_MARGIN_SECONDS だけ戻した時刻で、
   * 未確定の delivery を持つ人は、別の run で二重に送らないよう除外する。
   */
  private recipientAggregate(runId: string) {
    const reactor = alias(users, "reactor");
    const recipient = this.db
      .select({
        userId: users.id,
        regionCode: users.regionCode,
        windowStart: sql<string | null>`(
          select strftime(
            '%Y-%m-%dT%H:%M:%fZ',
            max(${reactionDigestDeliveries.windowEnd}),
            ${`-${WINDOW_START_MARGIN_SECONDS} seconds`}
          )
          from ${reactionDigestDeliveries}
          where ${eq(reactionDigestDeliveries.userId, users.id)}
            and ${eq(reactionDigestDeliveries.status, "sent")}
        )`.as("window_start"),
      })
      .from(users)
      .where(
        and(
          eq(users.friendStatus, "active"),
          isNull(users.deletedAt),
          notExists(
            this.db
              .select({ one: sql`1` })
              .from(reactionDigestDeliveries)
              .where(
                and(
                  eq(reactionDigestDeliveries.userId, users.id),
                  inArray(reactionDigestDeliveries.status, [
                    ...UNRESOLVED_DELIVERY_STATUSES,
                  ]),
                ),
              ),
          ),
        ),
      )
      .as("recipient");

    return this.db
      .select({
        userId: recipient.userId,
        windowStart: recipient.windowStart,
        regionCode: recipient.regionCode,
        // 同じ人が複数の投稿へ寄りそっても 1 人と数える。
        reactorCount: countDistinct(concernReactions.userId).as(
          "reactor_count",
        ),
        sameRegionCount: countDistinct(sql`case
          when ${recipient.regionCode} is not null
            and ${ne(recipient.regionCode, "no_answer")}
            and ${eq(reactor.regionCode, recipient.regionCode)}
          then ${concernReactions.userId} end`).as("same_region_count"),
        regionCount: countDistinct(sql`case
          when ${reactor.regionCode} is not null
            and ${ne(reactor.regionCode, "no_answer")}
          then ${reactor.regionCode} end`).as("region_count"),
      })
      .from(recipient)
      .innerJoin(
        concerns,
        and(
          eq(concerns.userId, recipient.userId),
          eq(concerns.visibilityStatus, "published"),
        ),
      )
      .innerJoin(
        concernReactions,
        and(
          eq(concernReactions.concernId, concerns.id),
          // 自分の寄りそいは数えない。
          ne(concernReactions.userId, recipient.userId),
        ),
      )
      .innerJoin(reactor, eq(reactor.id, concernReactions.userId))
      .where(
        and(
          lte(concernReactions.createdAt, runCutoffAt(runId)),
          or(
            isNull(recipient.windowStart),
            gt(concernReactions.createdAt, recipient.windowStart),
          ),
        ),
      )
      .groupBy(recipient.userId)
      .as("aggregate");
  }

  private async findOrCreateTargetRun(
    request: ReactionDigestRunRequest,
  ): Promise<string> {
    if (request.idempotencyKey) {
      // Cron は日付ごとの冪等キーが一意なので、INSERT 自体が重複を弾く。
      await this.insertRun(request);
      const row = await this.db
        .select({ id: reactionDigestRuns.id })
        .from(reactionDigestRuns)
        .where(eq(reactionDigestRuns.idempotencyKey, request.idempotencyKey))
        .get();
      if (!row) {
        throw new Error("reaction digest run was not created");
      }
      return row.id;
    }

    return this.findOrCreateManualRun(request);
  }

  /**
   * 手動実行の対象 run を決める。未完了の run があれば続きを送り、なければ新しく作る。
   * 手動実行は冪等キーが要求ごとに異なるため、未完了確認と作成を分けると
   * 同時に届いた要求がそれぞれ run を作れてしまう。判定と作成を一つの
   * 条件付き INSERT にまとめ、作れなかった要求は既存の run を掴む。
   */
  private async findOrCreateManualRun(
    request: ReactionDigestRunRequest,
  ): Promise<string> {
    for (let attempt = 0; attempt < MANUAL_RUN_ATTEMPTS; attempt += 1) {
      if (await this.insertRunIfNoneUnfinished(request)) {
        return request.newRunId;
      }

      const unfinished = await this.db
        .select({ id: reactionDigestRuns.id })
        .from(reactionDigestRuns)
        .where(inArray(reactionDigestRuns.status, [...UNFINISHED_RUN_STATUSES]))
        .orderBy(
          asc(reactionDigestRuns.requestedAt),
          asc(reactionDigestRuns.id),
        )
        .limit(1)
        .get();
      if (unfinished) {
        return unfinished.id;
      }
      // 条件付き INSERT を弾いた run が、その直後に完了した。もう一度作りに行く。
    }
    throw new Error("reaction digest run could not be created");
  }

  private async insertRun(request: ReactionDigestRunRequest): Promise<void> {
    await this.db
      .insert(reactionDigestRuns)
      .values({
        id: request.newRunId,
        trigger: request.trigger,
        idempotencyKey: request.newRunIdempotencyKey,
        status: "pending",
        cutoffAt: request.requestedAt,
        requestedAt: request.requestedAt,
      })
      .onConflictDoNothing({ target: reactionDigestRuns.idempotencyKey })
      .run();
  }

  /**
   * 未完了の run が一つも無いときだけ run を作り、作れた場合だけ true を返す。
   * 判定と作成を一文にするため、クエリビルダではなく select 句を直接渡す。
   * 列は drizzle がスキーマ宣言順に並べるので、値も同じ順にする。
   */
  private async insertRunIfNoneUnfinished(
    request: ReactionDigestRunRequest,
  ): Promise<boolean> {
    const result = await this.db
      .insert(reactionDigestRuns)
      .select(
        sql`select
          ${request.newRunId}, ${request.trigger}, ${request.newRunIdempotencyKey},
          'pending', ${request.requestedAt}, null, null, null, ${request.requestedAt}, null
        where not exists (
          select 1 from ${reactionDigestRuns}
          where ${inArray(reactionDigestRuns.status, [...UNFINISHED_RUN_STATUSES])}
        )`,
      )
      .onConflictDoNothing({ target: reactionDigestRuns.idempotencyKey })
      .run();
    return result.meta.changes > 0;
  }

  private runQuery() {
    return this.db
      .select(RUN_COLUMNS)
      .from(reactionDigestRuns)
      .leftJoin(
        reactionDigestDeliveries,
        eq(reactionDigestDeliveries.runId, reactionDigestRuns.id),
      );
  }

  private async findRunRow(runId: string): Promise<RunRow | undefined> {
    return this.runQuery()
      .where(eq(reactionDigestRuns.id, runId))
      .groupBy(reactionDigestRuns.id)
      .get();
  }

  /** claim を持つ runner だけが書き込めるようにする条件。 */
  private hasCurrentClaim(runId: string, claimToken: string): SQL {
    return exists(
      this.db
        .select({ one: sql`1` })
        .from(reactionDigestRuns)
        .where(
          and(
            eq(reactionDigestRuns.id, runId),
            eq(reactionDigestRuns.claimToken, claimToken),
            eq(reactionDigestRuns.status, "running"),
          ),
        ),
    );
  }
}

/** run の締め時刻。派生テーブルからは外側の run を参照できないため、その場で読み直す。 */
function runCutoffAt(runId: string): SQL<string> {
  return sql<string>`(
    select ${reactionDigestRuns.cutoffAt} from ${reactionDigestRuns}
    where ${eq(reactionDigestRuns.id, runId)}
  )`;
}

/** delivery の状態から run の結果を決める。未確定が残っていれば pending のままにする。 */
function runStatusFromDeliveries(): SQL<string> {
  return sql<string>`(
    select case
      when coalesce(sum(${inArray(reactionDigestDeliveries.status, [
        ...UNRESOLVED_DELIVERY_STATUSES,
      ])}), 0) > 0 then 'pending'
      when coalesce(sum(${eq(
        reactionDigestDeliveries.status,
        "failed",
      )}), 0) = 0 then 'succeeded'
      when coalesce(sum(${eq(
        reactionDigestDeliveries.status,
        "sent",
      )}), 0) = 0 then 'failed'
      else 'partially_failed'
    end
    from ${reactionDigestDeliveries}
    where ${eq(reactionDigestDeliveries.runId, reactionDigestRuns.id)}
  )`;
}

/** 遷移後の状態ごとに、更新する列と、遷移元として許す状態を決める。 */
function deliveryTransition(delivery: ReactionDigestDelivery): {
  from: readonly ReactionDigestDeliveryStatus[];
  set: SQLiteUpdateSetSource<typeof reactionDigestDeliveries>;
} | null {
  switch (delivery.status) {
    case "started":
      return {
        from: UNRESOLVED_DELIVERY_STATUSES,
        set: {
          status: "started",
          // 結果不明の再送では、最初に決めた Retry Key を使い続ける。
          lineRetryKey: sql`coalesce(${reactionDigestDeliveries.lineRetryKey}, ${delivery.retryKey})`,
          attemptedAt: delivery.attemptedAt,
        },
      };
    case "sent":
      return {
        from: ["started"],
        set: {
          status: "sent",
          httpStatus: delivery.response?.httpStatus ?? null,
          lineRequestId: delivery.response?.requestId ?? null,
          sentAt: delivery.sentAt,
          errorCode: null,
        },
      };
    case "failed":
      return {
        from: ["started"],
        set: {
          status: "failed",
          httpStatus: delivery.response?.httpStatus ?? null,
          lineRequestId: delivery.response?.requestId ?? null,
          errorCode: delivery.errorCode,
        },
      };
    case "skipped":
      return {
        from: UNRESOLVED_DELIVERY_STATUSES,
        set: {
          status: "skipped",
          errorCode: delivery.errorCode,
          attemptedAt: delivery.attemptedAt,
        },
      };
    case "pending":
      return null;
  }
}

const RUN_TRIGGERS: readonly ReactionDigestTrigger[] = ["cron", "manual"];
const RUN_STATUSES: readonly ReactionDigestRunStatus[] = [
  "pending",
  "running",
  "succeeded",
  "partially_failed",
  "failed",
];

function toRun(row: RunRow): ReactionDigestRun {
  return {
    runId: row.runId,
    trigger: parseEnum(RUN_TRIGGERS, row.trigger, "trigger"),
    status: parseEnum(RUN_STATUSES, row.status, "run status"),
    cutoffAt: row.cutoffAt,
    requestedAt: row.requestedAt,
    finishedAt: row.finishedAt,
    targetCount: row.targetCount,
    sentCount: row.sentCount,
    failedCount: row.failedCount,
    skippedCount: row.skippedCount,
    remainingCount: row.remainingCount,
  };
}

function toDelivery(row: DeliveryRow): ReactionDigestDelivery {
  return new ReactionDigestDelivery({
    id: row.id,
    runId: row.runId,
    // 送信対象として取り出すのは未確定（pending / started）の delivery だけ。
    status: parseEnum(
      ["pending", "started"] as const,
      row.status,
      "delivery status",
    ),
    retryKey: row.retryKey,
    attemptedAt: row.attemptedAt,
    sentAt: null,
    response: null,
    errorCode: null,
    recipient: {
      lineUserId: row.lineUserId,
      displayLanguage: parseDisplayLanguage(row.displayLanguage),
      isReachable: row.isReachable === 1,
    },
    summary: new ReactionDigestSummary({
      reactorCount: row.reactorCount,
      sameRegionCount: row.sameRegionCount,
      regionCount: row.regionCount,
      regionCode: row.regionCodeSnapshot,
    }),
  });
}

/** DB の値が想定する列挙値のどれかであることを確かめてから、その型として扱う。 */
function parseEnum<T extends string>(
  values: readonly T[],
  value: string,
  name: string,
): T {
  const found = values.find((candidate) => candidate === value);
  if (found === undefined) {
    throw new Error(`unexpected ${name} in reaction digest data`);
  }
  return found;
}

function parseDisplayLanguage(value: string): DisplayLanguage {
  return DISPLAY_LANGUAGES.find((language) => language === value) ?? "original";
}
