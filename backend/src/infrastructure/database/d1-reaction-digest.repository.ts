import {
  ClaimedReactionDigestRun,
  type ClaimReactionDigestRunResult,
  ReactionDigestDelivery,
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

interface RunRow {
  id: string;
  trigger: string;
  status: string;
  claim_token: string | null;
  cutoff_at: string;
  requested_at: string;
  finished_at: string | null;
  target_count: number;
  sent_count: number;
  failed_count: number;
  skipped_count: number;
  remaining_count: number;
}

interface DeliveryRow {
  id: string;
  run_id: string;
  status: string;
  line_retry_key: string | null;
  attempted_at: string | null;
  reactor_count: number;
  same_region_count: number;
  region_count: number;
  region_code_snapshot: string | null;
  line_user_id: string;
  display_language: string;
  is_reachable: number;
}

// run の件数は delivery から毎回集計し、run 側に二重に持たない。
const RUN_VIEW_SQL = `
  select
    r.id, r.trigger, r.status, r.claim_token, r.cutoff_at, r.requested_at, r.finished_at,
    count(d.id) as target_count,
    coalesce(sum(d.status = 'sent'), 0) as sent_count,
    coalesce(sum(d.status = 'failed'), 0) as failed_count,
    coalesce(sum(d.status = 'skipped'), 0) as skipped_count,
    coalesce(sum(d.status in ('pending', 'started')), 0) as remaining_count
  from reaction_digest_runs r
  left join reaction_digest_deliveries d on d.run_id = r.id`;

const HAS_CURRENT_CLAIM_SQL = `exists (
  select 1 from reaction_digest_runs r
  where r.id = ? and r.claim_token = ? and r.status = 'running'
)`;

/**
 * 寄りそい通知の run と受信者ごとの delivery を D1 へ保存する Adapter。
 * 集計と重複防止を一つの SQL 文で行うため、D1 の prepared statement を直接使う。
 */
export class D1ReactionDigestRepository implements ReactionDigestRepository {
  private readonly db: D1Database;

  constructor(database: D1Database) {
    this.db = database;
  }

  async claimRun(
    request: ReactionDigestRunRequest,
  ): Promise<ClaimReactionDigestRunResult> {
    const runId = await this.findOrCreateTargetRun(request);

    await this.db
      .prepare(
        `update reaction_digest_runs
         set status = 'running', claim_token = ?, lease_expires_at = ?
         where id = ?
           and (status = 'pending' or (status = 'running' and lease_expires_at <= ?))`,
      )
      .bind(
        request.claimToken,
        request.leaseExpiresAt,
        runId,
        request.requestedAt,
      )
      .run();

    const row = await this.findRunRow(runId);
    if (!row) {
      throw new Error("reaction digest run disappeared after claim");
    }
    const run = toRun(row);
    if (row.claim_token === request.claimToken) {
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
    // 受信者の起点は「最後に送信成功した delivery の window_end」。
    // 未確定（pending/started）の delivery を持つ人は、別の run で二重に送らないよう除外する。
    const insertDeliveries = this.db
      .prepare(
        `insert into reaction_digest_deliveries (
           id, run_id, user_id, window_start, window_end,
           reactor_count, same_region_count, region_count, region_code_snapshot,
           status, created_at
         )
         select
           lower(hex(randomblob(16))), run.id, agg.user_id, agg.window_start, run.cutoff_at,
           agg.reactor_count, agg.same_region_count, agg.region_count, agg.region_code,
           'pending', ?
         from reaction_digest_runs run
         join (
           select
             recipient.user_id,
             recipient.window_start,
             recipient.region_code,
             count(distinct reaction.user_id) as reactor_count,
             count(distinct case
               when recipient.region_code is not null
                 and recipient.region_code <> 'no_answer'
                 and reactor.region_code = recipient.region_code
               then reaction.user_id end) as same_region_count,
             count(distinct case
               when reactor.region_code is not null
                 and reactor.region_code <> 'no_answer'
               then reactor.region_code end) as region_count
           from (
             select
               u.id as user_id,
               u.region_code,
               (
                 select max(sent.window_end)
                 from reaction_digest_deliveries sent
                 where sent.user_id = u.id and sent.status = 'sent'
               ) as window_start
             from users u
             where u.friend_status = 'active'
               and u.deleted_at is null
               and not exists (
                 select 1 from reaction_digest_deliveries unresolved
                 where unresolved.user_id = u.id
                   and unresolved.status in ('pending', 'started')
               )
           ) recipient
           join concerns c
             on c.user_id = recipient.user_id
            and c.visibility_status = 'published'
           join concern_reactions reaction
             on reaction.concern_id = c.id
            and reaction.user_id <> recipient.user_id
           join users reactor on reactor.id = reaction.user_id
           where reaction.created_at <= (
               select cutoff_at from reaction_digest_runs where id = ?
             )
             and (
               recipient.window_start is null
               or reaction.created_at > recipient.window_start
             )
           group by recipient.user_id
         ) agg
         where run.id = ?
           and run.claim_token = ?
           and run.status = 'running'
           and run.deliveries_prepared_at is null
         on conflict do nothing`,
      )
      .bind(preparedAt, runId, runId, claimToken);

    const markPrepared = this.db
      .prepare(
        `update reaction_digest_runs
         set deliveries_prepared_at = ?
         where id = ? and claim_token = ? and status = 'running'
           and deliveries_prepared_at is null`,
      )
      .bind(preparedAt, runId, claimToken);

    await this.db.batch([insertDeliveries, markPrepared]);
  }

  async listSendableDeliveries(
    claimed: ClaimedReactionDigestRun,
    limit: number,
  ): Promise<ReactionDigestDelivery[]> {
    const { runId, claimToken } = claimed;
    const { results } = await this.db
      .prepare(
        `select
           d.id, d.run_id, d.status, d.line_retry_key, d.attempted_at,
           d.reactor_count, d.same_region_count, d.region_count, d.region_code_snapshot,
           u.line_user_id, u.display_language,
           (u.friend_status = 'active' and u.deleted_at is null) as is_reachable
         from reaction_digest_deliveries d
         join users u on u.id = d.user_id
         where d.run_id = ?
           and d.status in ('pending', 'started')
           and ${HAS_CURRENT_CLAIM_SQL}
         order by d.created_at, d.id
         limit ?`,
      )
      .bind(runId, runId, claimToken, limit)
      .all<DeliveryRow>();

    return results.map(toDelivery);
  }

  async saveDelivery(
    claimed: ClaimedReactionDigestRun,
    delivery: ReactionDigestDelivery,
  ): Promise<boolean> {
    if (delivery.runId !== claimed.runId) {
      return false;
    }
    const update = deliveryUpdate(delivery);
    if (!update) {
      return false;
    }
    const result = await this.db
      .prepare(update.sql)
      .bind(
        ...update.values,
        delivery.id,
        claimed.runId,
        claimed.runId,
        claimed.claimToken,
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
      .prepare(
        `update reaction_digest_runs
         set status = (
               select case
                 when coalesce(sum(d.status in ('pending', 'started')), 0) > 0 then 'pending'
                 when coalesce(sum(d.status = 'failed'), 0) = 0 then 'succeeded'
                 when coalesce(sum(d.status = 'sent'), 0) = 0 then 'failed'
                 else 'partially_failed'
               end
               from reaction_digest_deliveries d
               where d.run_id = reaction_digest_runs.id
             ),
             claim_token = null,
             lease_expires_at = null
         where id = ? and claim_token = ? and status = 'running'`,
      )
      .bind(runId, claimToken)
      .run();
    await this.db
      .prepare(
        `update reaction_digest_runs
         set finished_at = ?
         where id = ? and status <> 'pending' and status <> 'running'
           and finished_at is null`,
      )
      .bind(finishedAt, runId)
      .run();

    const row = await this.findRunRow(runId);
    if (!row) {
      throw new Error("reaction digest run not found");
    }
    return toRun(row);
  }

  async findRecentRuns(limit: number): Promise<ReactionDigestRun[]> {
    const { results } = await this.db
      .prepare(
        `${RUN_VIEW_SQL}
         group by r.id
         order by r.requested_at desc, r.id desc
         limit ?`,
      )
      .bind(limit)
      .all<RunRow>();
    return results.map(toRun);
  }

  private async findOrCreateTargetRun(
    request: ReactionDigestRunRequest,
  ): Promise<string> {
    if (request.idempotencyKey) {
      await this.insertRun(request);
      const row = await this.db
        .prepare(
          "select id from reaction_digest_runs where idempotency_key = ?",
        )
        .bind(request.idempotencyKey)
        .first<{ id: string }>();
      if (!row) {
        throw new Error("reaction digest run was not created");
      }
      return row.id;
    }

    // 手動実行は、未完了の run があれば新しく作らずに続きを送る。
    const unfinished = await this.db
      .prepare(
        `select id from reaction_digest_runs
         where status in ('pending', 'running')
         order by requested_at, id
         limit 1`,
      )
      .first<{ id: string }>();
    if (unfinished) {
      return unfinished.id;
    }

    await this.insertRun(request);
    return request.newRunId;
  }

  private async insertRun(request: ReactionDigestRunRequest): Promise<void> {
    await this.db
      .prepare(
        `insert into reaction_digest_runs
           (id, trigger, idempotency_key, status, cutoff_at, requested_at)
         values (?, ?, ?, 'pending', ?, ?)
         on conflict (idempotency_key) do nothing`,
      )
      .bind(
        request.newRunId,
        request.trigger,
        request.newRunIdempotencyKey,
        request.requestedAt,
        request.requestedAt,
      )
      .run();
  }

  private async findRunRow(runId: string): Promise<RunRow | null> {
    return this.db
      .prepare(`${RUN_VIEW_SQL} where r.id = ? group by r.id`)
      .bind(runId)
      .first<RunRow>();
  }
}

/**
 * 遷移後の状態ごとに、遷移元の状態を条件にした UPDATE を組み立てる。
 * values の後ろに続く 4 つの bind は delivery ID、run ID、claim の run ID と claim token。
 */
function deliveryUpdate(
  delivery: ReactionDigestDelivery,
): { sql: string; values: (string | number | null)[] } | null {
  const condition = (fromStatuses: string) => `
    where id = ? and run_id = ? and status in (${fromStatuses})
      and ${HAS_CURRENT_CLAIM_SQL}`;

  switch (delivery.status) {
    case "started":
      return {
        sql: `update reaction_digest_deliveries
           set status = 'started',
               line_retry_key = coalesce(line_retry_key, ?),
               attempted_at = ?
           ${condition("'pending', 'started'")}`,
        values: [delivery.retryKey, delivery.attemptedAt],
      };
    case "sent":
      return {
        sql: `update reaction_digest_deliveries
           set status = 'sent', http_status = ?, line_request_id = ?,
               sent_at = ?, error_code = null
           ${condition("'started'")}`,
        values: [
          delivery.response?.httpStatus ?? null,
          delivery.response?.requestId ?? null,
          delivery.sentAt,
        ],
      };
    case "failed":
      return {
        sql: `update reaction_digest_deliveries
           set status = 'failed', http_status = ?, line_request_id = ?,
               error_code = ?
           ${condition("'started'")}`,
        values: [
          delivery.response?.httpStatus ?? null,
          delivery.response?.requestId ?? null,
          delivery.errorCode,
        ],
      };
    case "skipped":
      return {
        sql: `update reaction_digest_deliveries
           set status = 'skipped', error_code = ?, attempted_at = ?
           ${condition("'pending', 'started'")}`,
        values: [delivery.errorCode, delivery.attemptedAt],
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
    runId: row.id,
    trigger: parseEnum(RUN_TRIGGERS, row.trigger, "trigger"),
    status: parseEnum(RUN_STATUSES, row.status, "run status"),
    cutoffAt: row.cutoff_at,
    requestedAt: row.requested_at,
    finishedAt: row.finished_at,
    targetCount: row.target_count,
    sentCount: row.sent_count,
    failedCount: row.failed_count,
    skippedCount: row.skipped_count,
    remainingCount: row.remaining_count,
  };
}

function toDelivery(row: DeliveryRow): ReactionDigestDelivery {
  return new ReactionDigestDelivery({
    id: row.id,
    runId: row.run_id,
    // 送信対象として取り出すのは未確定（pending / started）の delivery だけ。
    status: parseEnum(
      ["pending", "started"] as const,
      row.status,
      "delivery status",
    ),
    retryKey: row.line_retry_key,
    attemptedAt: row.attempted_at,
    sentAt: null,
    response: null,
    errorCode: null,
    recipient: {
      lineUserId: row.line_user_id,
      displayLanguage: parseDisplayLanguage(row.display_language),
      isReachable: row.is_reachable === 1,
    },
    summary: new ReactionDigestSummary({
      reactorCount: row.reactor_count,
      sameRegionCount: row.same_region_count,
      regionCount: row.region_count,
      regionCode: row.region_code_snapshot,
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
