import type {
  ClaimDailyBroadcastResult,
  DailyBroadcastView,
  LineWebhookEvent,
} from "../../application/entity/line-integration.entity";
import type {
  ClaimDailyBroadcastInput,
  FailDailyBroadcastInput,
  FinishDailyBroadcastInput,
  LineRepository,
} from "../../application/repository/line.repository";

/** LINE のイベント冪等性と一斉配信状態を D1 へ保存する Adapter。 */
export class D1LineRepository implements LineRepository {
  private readonly database: D1Database;

  constructor(database: D1Database) {
    this.database = database;
  }

  async recordWebhookEvent(
    event: LineWebhookEvent,
    receivedAt: string,
    userId: string,
  ): Promise<"processed" | "ignored" | "duplicate"> {
    const isFollow = event.eventType === "follow";
    const isUnfollow = event.eventType === "unfollow";
    const hasUser = event.sourceType === "user" && Boolean(event.lineUserId);
    const canProcess = hasUser && (isFollow || isUnfollow);

    const statements = [
      this.database
        .prepare(
          `INSERT OR IGNORE INTO line_webhook_events
             (webhook_event_id, event_type, status, received_at)
           VALUES (?, ?, 'received', ?)`,
        )
        .bind(event.webhookEventId, event.eventType, receivedAt),
    ];

    if (canProcess && isFollow && event.lineUserId) {
      statements.push(
        this.database
          .prepare(
            `INSERT INTO users
               (id, line_user_id, friend_status, joined_at, last_seen_at, created_at, updated_at)
             SELECT ?, ?, 'active', ?, ?, ?, ?
             WHERE EXISTS (
               SELECT 1 FROM line_webhook_events
               WHERE webhook_event_id = ? AND status = 'received'
             )
             ON CONFLICT (line_user_id) DO UPDATE SET
               friend_status = 'active',
               joined_at = COALESCE(users.joined_at, excluded.joined_at),
               unfollowed_at = NULL,
               last_seen_at = excluded.last_seen_at,
               updated_at = excluded.updated_at`,
          )
          .bind(
            userId,
            event.lineUserId,
            receivedAt,
            receivedAt,
            receivedAt,
            receivedAt,
            event.webhookEventId,
          ),
      );
    }

    if (canProcess && isUnfollow && event.lineUserId) {
      statements.push(
        this.database
          .prepare(
            `UPDATE users
             SET friend_status = 'unfollowed', unfollowed_at = ?, updated_at = ?
             WHERE line_user_id = ?
               AND EXISTS (
                 SELECT 1 FROM line_webhook_events
                 WHERE webhook_event_id = ? AND status = 'received'
               )`,
          )
          .bind(receivedAt, receivedAt, event.lineUserId, event.webhookEventId),
      );
    }

    statements.push(
      this.database
        .prepare(
          `UPDATE line_webhook_events
           SET user_id = CASE
                 WHEN ? = 1 THEN (SELECT id FROM users WHERE line_user_id = ?)
                 ELSE NULL
               END,
               status = CASE
                 WHEN ? = 1 AND EXISTS (
                   SELECT 1 FROM users WHERE line_user_id = ?
                 ) THEN 'processed'
                 ELSE 'ignored'
               END,
               processed_at = ?
           WHERE webhook_event_id = ? AND status = 'received'`,
        )
        .bind(
          canProcess ? 1 : 0,
          event.lineUserId ?? "",
          canProcess ? 1 : 0,
          event.lineUserId ?? "",
          receivedAt,
          event.webhookEventId,
        ),
    );

    const results = await this.database.batch(statements);
    if (results[0]?.meta.changes === 0) {
      return "duplicate";
    }

    const row = await this.database
      .prepare(
        `SELECT status FROM line_webhook_events WHERE webhook_event_id = ?`,
      )
      .bind(event.webhookEventId)
      .first<{ status: string }>();
    return row?.status === "processed" ? "processed" : "ignored";
  }

  async findDailyBroadcast(quizDate: string): Promise<DailyBroadcastView> {
    const row = await this.database
      .prepare(
        `SELECT quizzes.id AS quiz_id,
                line_broadcasts.status AS broadcast_status,
                line_broadcasts.requested_at AS requested_at,
                line_broadcasts.sent_at AS sent_at,
                line_broadcasts.finished_at AS finished_at
         FROM quizzes
         LEFT JOIN line_broadcasts ON line_broadcasts.quiz_id = quizzes.id
         WHERE quizzes.quiz_date = ? AND quizzes.status = 'published'
         LIMIT 1`,
      )
      .bind(quizDate)
      .first<{
        quiz_id: string;
        broadcast_status: string | null;
        requested_at: string | null;
        sent_at: string | null;
        finished_at: string | null;
      }>();

    if (!row) {
      return {
        quizDate,
        quizId: null,
        quizStatus: "missing",
        broadcastStatus: "not_started",
        requestedAt: null,
        sentAt: null,
        finishedAt: null,
      };
    }

    return {
      quizDate,
      quizId: row.quiz_id,
      quizStatus: "published",
      broadcastStatus: isBroadcastStatus(row.broadcast_status)
        ? row.broadcast_status
        : "not_started",
      requestedAt: row.requested_at,
      sentAt: row.sent_at,
      finishedAt: row.finished_at,
    };
  }

  async claimDailyBroadcast(
    input: ClaimDailyBroadcastInput,
  ): Promise<ClaimDailyBroadcastResult> {
    const quiz = await this.database
      .prepare(
        `SELECT quizzes.id
         FROM quizzes
         WHERE quizzes.id = ?
           AND quizzes.quiz_date = ?
           AND quizzes.status = 'published'
           AND (SELECT COUNT(*) FROM quiz_participants WHERE quiz_id = quizzes.id) = 3
           AND NOT EXISTS (
             SELECT 1
             FROM quiz_participants
             INNER JOIN concerns ON concerns.id = quiz_participants.concern_id
             WHERE quiz_participants.quiz_id = quizzes.id
               AND concerns.visibility_status <> 'published'
           )`,
      )
      .bind(input.quizId, input.quizDate)
      .first<{ id: string }>();

    if (!quiz) {
      return { status: "not_available" };
    }

    await this.database
      .prepare(
        `INSERT INTO line_broadcasts
           (id, quiz_id, idempotency_key, status, requested_at)
         VALUES (?, ?, ?, 'pending', ?)
         ON CONFLICT (quiz_id) DO NOTHING`,
      )
      .bind(
        input.broadcastId,
        input.quizId,
        `daily-quiz:${input.quizDate}`,
        input.now,
      )
      .run();

    await this.database
      .prepare(
        `UPDATE line_broadcasts
         SET status = 'running', claim_token = ?, lease_expires_at = ?, last_error = NULL
         WHERE quiz_id = ?
           AND status <> 'succeeded'
           AND (
             status IN ('pending', 'failed')
             OR (status = 'running' AND lease_expires_at <= ?)
           )`,
      )
      .bind(input.claimToken, input.leaseExpiresAt, input.quizId, input.now)
      .run();

    const broadcast = await this.database
      .prepare(
        `SELECT id, status, claim_token, lease_expires_at, requested_at, sent_at, finished_at
         FROM line_broadcasts WHERE quiz_id = ?`,
      )
      .bind(input.quizId)
      .first<{
        id: string;
        status: string;
        claim_token: string | null;
        lease_expires_at: string | null;
        requested_at: string;
        sent_at: string | null;
        finished_at: string | null;
      }>();

    if (!broadcast) {
      return { status: "not_available" };
    }

    const view: DailyBroadcastView = {
      quizDate: input.quizDate,
      quizId: input.quizId,
      quizStatus: "published",
      broadcastStatus: isBroadcastStatus(broadcast.status)
        ? broadcast.status
        : "not_started",
      requestedAt: broadcast.requested_at,
      sentAt: broadcast.sent_at,
      finishedAt: broadcast.finished_at,
    };

    if (broadcast.status === "succeeded") {
      return { status: "succeeded", broadcastId: broadcast.id, view };
    }
    if (broadcast.claim_token !== input.claimToken) {
      return { status: "in_progress", broadcastId: broadcast.id, view };
    }

    const previousAttempt = await this.database
      .prepare(
        `SELECT id, attempt_number, status, line_retry_key
         FROM line_broadcast_attempts
         WHERE broadcast_id = ?
         ORDER BY attempt_number DESC
         LIMIT 1`,
      )
      .bind(broadcast.id)
      .first<{
        id: string;
        attempt_number: number;
        status: string;
        line_retry_key: string;
      }>();

    if (previousAttempt?.status === "started") {
      return {
        status: "claimed",
        broadcastId: broadcast.id,
        claimToken: input.claimToken,
        attempt: {
          id: previousAttempt.id,
          attemptNumber: previousAttempt.attempt_number,
          retryKey: previousAttempt.line_retry_key,
        },
      };
    }

    const attemptNumber = (previousAttempt?.attempt_number ?? 0) + 1;
    await this.database
      .prepare(
        `INSERT INTO line_broadcast_attempts
           (id, broadcast_id, attempt_number, status, line_retry_key, attempted_at)
         SELECT ?, ?, ?, 'started', ?, ?
         WHERE EXISTS (
           SELECT 1 FROM line_broadcasts
           WHERE id = ? AND claim_token = ? AND status = 'running'
         )`,
      )
      .bind(
        input.attemptId,
        broadcast.id,
        attemptNumber,
        input.retryKey,
        input.now,
        broadcast.id,
        input.claimToken,
      )
      .run();

    return {
      status: "claimed",
      broadcastId: broadcast.id,
      claimToken: input.claimToken,
      attempt: {
        id: input.attemptId,
        attemptNumber,
        retryKey: input.retryKey,
      },
    };
  }

  async completeDailyBroadcast(
    input: FinishDailyBroadcastInput,
  ): Promise<void> {
    await this.database.batch([
      this.database
        .prepare(
          `UPDATE line_broadcast_attempts
           SET status = 'succeeded', http_status = ?, line_request_id = ?,
               line_accepted_request_id = ?, error_message = NULL
           WHERE id = ? AND broadcast_id = ?
             AND EXISTS (
               SELECT 1 FROM line_broadcasts
               WHERE id = ? AND claim_token = ? AND status = 'running'
             )`,
        )
        .bind(
          input.httpStatus,
          input.requestId,
          input.acceptedRequestId,
          input.attemptId,
          input.broadcastId,
          input.broadcastId,
          input.claimToken,
        ),
      this.database
        .prepare(
          `UPDATE line_broadcasts
           SET status = 'succeeded', claim_token = NULL, lease_expires_at = NULL,
               sent_at = ?, finished_at = ?, last_error = NULL
           WHERE id = ? AND claim_token = ? AND status = 'running'`,
        )
        .bind(
          input.finishedAt,
          input.finishedAt,
          input.broadcastId,
          input.claimToken,
        ),
    ]);
  }

  async failDailyBroadcast(input: FailDailyBroadcastInput): Promise<void> {
    await this.database.batch([
      this.database
        .prepare(
          `UPDATE line_broadcast_attempts
           SET status = 'failed', http_status = ?, line_request_id = ?,
               line_accepted_request_id = ?, error_message = ?
           WHERE id = ? AND broadcast_id = ?
             AND EXISTS (
               SELECT 1 FROM line_broadcasts
               WHERE id = ? AND claim_token = ? AND status = 'running'
             )`,
        )
        .bind(
          input.httpStatus,
          input.requestId,
          input.acceptedRequestId,
          input.errorCode,
          input.attemptId,
          input.broadcastId,
          input.broadcastId,
          input.claimToken,
        ),
      this.database
        .prepare(
          `UPDATE line_broadcasts
           SET status = 'failed', claim_token = NULL, lease_expires_at = NULL,
               finished_at = ?, last_error = ?
           WHERE id = ? AND claim_token = ? AND status = 'running'`,
        )
        .bind(
          input.finishedAt,
          input.errorCode,
          input.broadcastId,
          input.claimToken,
        ),
    ]);
  }

  async recordUncertainDailyBroadcast(
    input: Pick<
      FinishDailyBroadcastInput,
      "broadcastId" | "claimToken" | "attemptId"
    >,
  ): Promise<void> {
    await this.database
      .prepare(
        `UPDATE line_broadcasts
         SET last_error = 'upstream_result_unknown'
         WHERE id = ? AND claim_token = ? AND status = 'running'
           AND EXISTS (
             SELECT 1 FROM line_broadcast_attempts
             WHERE id = ? AND broadcast_id = ? AND status = 'started'
           )`,
      )
      .bind(
        input.broadcastId,
        input.claimToken,
        input.attemptId,
        input.broadcastId,
      )
      .run();
  }
}

function isBroadcastStatus(
  status: string | null,
): status is DailyBroadcastView["broadcastStatus"] {
  return (
    status === "not_started" ||
    status === "pending" ||
    status === "running" ||
    status === "succeeded" ||
    status === "failed"
  );
}
