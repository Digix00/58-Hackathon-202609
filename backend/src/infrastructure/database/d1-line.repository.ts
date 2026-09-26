import { and, desc, eq, inArray, lte, ne, or, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { drizzle } from "drizzle-orm/d1";

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
import {
  concerns,
  lineBroadcastAttempts,
  lineBroadcasts,
  lineWebhookEvents,
  quizParticipants,
  quizzes,
  users,
} from "./schema";

type NonEmptySqliteBatch = [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]];

/** LINE のイベント冪等性と一斉配信状態を D1 へ保存する Adapter。 */
export class D1LineRepository implements LineRepository {
  private readonly db: ReturnType<typeof drizzle>;

  constructor(database: D1Database) {
    this.db = drizzle(database);
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

    const statements: BatchItem<"sqlite">[] = [
      this.db
        .insert(lineWebhookEvents)
        .values({
          webhookEventId: event.webhookEventId,
          eventType: event.eventType,
          status: "received",
          receivedAt,
        })
        .onConflictDoNothing({ target: lineWebhookEvents.webhookEventId })
        .returning({ webhookEventId: lineWebhookEvents.webhookEventId }),
    ];

    if (canProcess && isFollow && event.lineUserId) {
      const activeUser = this.db
        .select({
          id: sql<string>`${userId}`.as("id"),
          lineUserId: sql<string>`${event.lineUserId}`.as("lineUserId"),
          displayLanguage: sql<string>`'original'`.as("displayLanguage"),
          fontSize: sql<string>`'normal'`.as("fontSize"),
          birthYear: sql<number | null>`null`.as("birthYear"),
          birthMonth: sql<number | null>`null`.as("birthMonth"),
          genderCode: sql<string | null>`null`.as("genderCode"),
          regionCode: sql<string | null>`null`.as("regionCode"),
          friendStatus: sql<string>`'active'`.as("friendStatus"),
          joinedAt: sql<string>`${receivedAt}`.as("joinedAt"),
          unfollowedAt: sql<string | null>`null`.as("unfollowedAt"),
          lastSeenAt: sql<string>`${receivedAt}`.as("lastSeenAt"),
          createdAt: sql<string>`${receivedAt}`.as("createdAt"),
          updatedAt: sql<string>`${receivedAt}`.as("updatedAt"),
          deletedAt: sql<string | null>`null`.as("deletedAt"),
        })
        .from(lineWebhookEvents)
        .where(
          and(
            eq(lineWebhookEvents.webhookEventId, event.webhookEventId),
            eq(lineWebhookEvents.status, "received"),
          ),
        );

      statements.push(
        this.db
          .insert(users)
          .select(activeUser)
          .onConflictDoUpdate({
            target: users.lineUserId,
            set: {
              friendStatus: "active",
              joinedAt: sql`coalesce(${users.joinedAt}, excluded.joined_at)`,
              unfollowedAt: null,
              lastSeenAt: sql`excluded.last_seen_at`,
              updatedAt: sql`excluded.updated_at`,
            },
          }),
      );
    }

    if (canProcess && isUnfollow && event.lineUserId) {
      statements.push(
        this.db
          .update(users)
          .set({
            friendStatus: "unfollowed",
            unfollowedAt: receivedAt,
            updatedAt: receivedAt,
          })
          .where(
            and(
              eq(users.lineUserId, event.lineUserId),
              sql`exists (
                select 1 from ${lineWebhookEvents}
                where ${lineWebhookEvents.webhookEventId} = ${event.webhookEventId}
                  and ${lineWebhookEvents.status} = 'received'
              )`,
            ),
          ),
      );
    }

    statements.push(
      this.db
        .update(lineWebhookEvents)
        .set({
          userId:
            canProcess && event.lineUserId
              ? sql<string | null>`(
                select ${users.id}
                from ${users}
                where ${users.lineUserId} = ${event.lineUserId}
                limit 1
              )`
              : null,
          status:
            canProcess && event.lineUserId
              ? sql<string>`case when exists (
                select 1 from ${users}
                where ${users.lineUserId} = ${event.lineUserId}
              ) then 'processed' else 'ignored' end`
              : "ignored",
          processedAt: receivedAt,
        })
        .where(
          and(
            eq(lineWebhookEvents.webhookEventId, event.webhookEventId),
            eq(lineWebhookEvents.status, "received"),
          ),
        ),
    );

    const results = await this.db.batch(asNonEmptyBatch(statements));
    const insertedEvents = results[0] as
      | { webhookEventId: string }[]
      | undefined;
    if (!insertedEvents?.length) {
      return "duplicate";
    }

    const row = await this.db
      .select({ status: lineWebhookEvents.status })
      .from(lineWebhookEvents)
      .where(eq(lineWebhookEvents.webhookEventId, event.webhookEventId))
      .get();
    return row?.status === "processed" ? "processed" : "ignored";
  }

  async findDailyBroadcast(quizDate: string): Promise<DailyBroadcastView> {
    const row = await this.db
      .select({
        quizId: quizzes.id,
        broadcastStatus: lineBroadcasts.status,
        requestedAt: lineBroadcasts.requestedAt,
        sentAt: lineBroadcasts.sentAt,
        finishedAt: lineBroadcasts.finishedAt,
      })
      .from(quizzes)
      .leftJoin(lineBroadcasts, eq(lineBroadcasts.quizId, quizzes.id))
      .where(
        and(eq(quizzes.quizDate, quizDate), eq(quizzes.status, "published")),
      )
      .limit(1)
      .get();

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
      quizId: row.quizId,
      quizStatus: "published",
      broadcastStatus: isBroadcastStatus(row.broadcastStatus)
        ? row.broadcastStatus
        : "not_started",
      requestedAt: row.requestedAt,
      sentAt: row.sentAt,
      finishedAt: row.finishedAt,
    };
  }

  async claimDailyBroadcast(
    input: ClaimDailyBroadcastInput,
  ): Promise<ClaimDailyBroadcastResult> {
    const quiz = await this.db
      .select({ id: quizzes.id })
      .from(quizzes)
      .where(
        and(
          eq(quizzes.id, input.quizId),
          eq(quizzes.quizDate, input.quizDate),
          eq(quizzes.status, "published"),
          sql`(
            select count(*) from ${quizParticipants}
            where ${quizParticipants.quizId} = ${quizzes.id}
          ) = 3`,
          sql`not exists (
            select 1
            from ${quizParticipants}
            inner join ${concerns}
              on ${concerns.id} = ${quizParticipants.concernId}
            where ${quizParticipants.quizId} = ${quizzes.id}
              and ${concerns.visibilityStatus} <> 'published'
          )`,
        ),
      )
      .get();

    if (!quiz) {
      return { status: "not_available" };
    }

    await this.db
      .insert(lineBroadcasts)
      .values({
        id: input.broadcastId,
        quizId: input.quizId,
        idempotencyKey: `daily-quiz:${input.quizDate}`,
        status: "pending",
        requestedAt: input.now,
      })
      .onConflictDoNothing({ target: lineBroadcasts.quizId })
      .run();

    await this.db
      .update(lineBroadcasts)
      .set({
        status: "running",
        claimToken: input.claimToken,
        leaseExpiresAt: input.leaseExpiresAt,
        lastError: null,
      })
      .where(
        and(
          eq(lineBroadcasts.quizId, input.quizId),
          ne(lineBroadcasts.status, "succeeded"),
          or(
            inArray(lineBroadcasts.status, ["pending", "failed"]),
            and(
              eq(lineBroadcasts.status, "running"),
              lte(lineBroadcasts.leaseExpiresAt, input.now),
            ),
          ),
        ),
      )
      .run();

    const broadcast = await this.db
      .select({
        id: lineBroadcasts.id,
        status: lineBroadcasts.status,
        claimToken: lineBroadcasts.claimToken,
        requestedAt: lineBroadcasts.requestedAt,
        sentAt: lineBroadcasts.sentAt,
        finishedAt: lineBroadcasts.finishedAt,
      })
      .from(lineBroadcasts)
      .where(eq(lineBroadcasts.quizId, input.quizId))
      .get();

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
      requestedAt: broadcast.requestedAt,
      sentAt: broadcast.sentAt,
      finishedAt: broadcast.finishedAt,
    };

    if (broadcast.status === "succeeded") {
      return { status: "succeeded", broadcastId: broadcast.id, view };
    }
    if (broadcast.claimToken !== input.claimToken) {
      return { status: "in_progress", broadcastId: broadcast.id, view };
    }

    const previousAttempt = await this.db
      .select({
        id: lineBroadcastAttempts.id,
        attemptNumber: lineBroadcastAttempts.attemptNumber,
        status: lineBroadcastAttempts.status,
        retryKey: lineBroadcastAttempts.lineRetryKey,
      })
      .from(lineBroadcastAttempts)
      .where(eq(lineBroadcastAttempts.broadcastId, broadcast.id))
      .orderBy(desc(lineBroadcastAttempts.attemptNumber))
      .limit(1)
      .get();

    if (previousAttempt?.status === "started") {
      return {
        status: "claimed",
        broadcastId: broadcast.id,
        claimToken: input.claimToken,
        attempt: {
          id: previousAttempt.id,
          attemptNumber: previousAttempt.attemptNumber,
          retryKey: previousAttempt.retryKey,
        },
      };
    }

    const attemptNumber = (previousAttempt?.attemptNumber ?? 0) + 1;
    const newAttempt = this.db
      .select({
        id: sql<string>`${input.attemptId}`.as("id"),
        broadcastId: lineBroadcasts.id,
        attemptNumber: sql<number>`${attemptNumber}`.as("attemptNumber"),
        status: sql<string>`'started'`.as("status"),
        httpStatus: sql<number | null>`null`.as("httpStatus"),
        lineRequestId: sql<string | null>`null`.as("lineRequestId"),
        lineAcceptedRequestId: sql<string | null>`null`.as(
          "lineAcceptedRequestId",
        ),
        lineRetryKey: sql<string>`${input.retryKey}`.as("lineRetryKey"),
        attemptedAt: sql<string>`${input.now}`.as("attemptedAt"),
        errorMessage: sql<string | null>`null`.as("errorMessage"),
      })
      .from(lineBroadcasts)
      .where(
        and(
          eq(lineBroadcasts.id, broadcast.id),
          eq(lineBroadcasts.claimToken, input.claimToken),
          eq(lineBroadcasts.status, "running"),
        ),
      );

    await this.db.insert(lineBroadcastAttempts).select(newAttempt).run();

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
    const hasCurrentClaim = sql`exists (
      select 1 from ${lineBroadcasts}
      where ${lineBroadcasts.id} = ${input.broadcastId}
        and ${lineBroadcasts.claimToken} = ${input.claimToken}
        and ${lineBroadcasts.status} = 'running'
    )`;

    await this.db.batch([
      this.db
        .update(lineBroadcastAttempts)
        .set({
          status: "succeeded",
          httpStatus: input.httpStatus,
          lineRequestId: input.requestId,
          lineAcceptedRequestId: input.acceptedRequestId,
          errorMessage: null,
        })
        .where(
          and(
            eq(lineBroadcastAttempts.id, input.attemptId),
            eq(lineBroadcastAttempts.broadcastId, input.broadcastId),
            hasCurrentClaim,
          ),
        ),
      this.db
        .update(lineBroadcasts)
        .set({
          status: "succeeded",
          claimToken: null,
          leaseExpiresAt: null,
          sentAt: input.finishedAt,
          finishedAt: input.finishedAt,
          lastError: null,
        })
        .where(
          and(
            eq(lineBroadcasts.id, input.broadcastId),
            eq(lineBroadcasts.claimToken, input.claimToken),
            eq(lineBroadcasts.status, "running"),
          ),
        ),
    ]);
  }

  async failDailyBroadcast(input: FailDailyBroadcastInput): Promise<void> {
    const hasCurrentClaim = sql`exists (
      select 1 from ${lineBroadcasts}
      where ${lineBroadcasts.id} = ${input.broadcastId}
        and ${lineBroadcasts.claimToken} = ${input.claimToken}
        and ${lineBroadcasts.status} = 'running'
    )`;

    await this.db.batch([
      this.db
        .update(lineBroadcastAttempts)
        .set({
          status: "failed",
          httpStatus: input.httpStatus,
          lineRequestId: input.requestId,
          lineAcceptedRequestId: input.acceptedRequestId,
          errorMessage: input.errorCode,
        })
        .where(
          and(
            eq(lineBroadcastAttempts.id, input.attemptId),
            eq(lineBroadcastAttempts.broadcastId, input.broadcastId),
            hasCurrentClaim,
          ),
        ),
      this.db
        .update(lineBroadcasts)
        .set({
          status: "failed",
          claimToken: null,
          leaseExpiresAt: null,
          finishedAt: input.finishedAt,
          lastError: input.errorCode,
        })
        .where(
          and(
            eq(lineBroadcasts.id, input.broadcastId),
            eq(lineBroadcasts.claimToken, input.claimToken),
            eq(lineBroadcasts.status, "running"),
          ),
        ),
    ]);
  }

  async recordUncertainDailyBroadcast(
    input: Pick<
      FinishDailyBroadcastInput,
      "broadcastId" | "claimToken" | "attemptId"
    >,
  ): Promise<void> {
    await this.db
      .update(lineBroadcasts)
      .set({ lastError: "upstream_result_unknown" })
      .where(
        and(
          eq(lineBroadcasts.id, input.broadcastId),
          eq(lineBroadcasts.claimToken, input.claimToken),
          eq(lineBroadcasts.status, "running"),
          sql`exists (
            select 1 from ${lineBroadcastAttempts}
            where ${lineBroadcastAttempts.id} = ${input.attemptId}
              and ${lineBroadcastAttempts.broadcastId} = ${input.broadcastId}
              and ${lineBroadcastAttempts.status} = 'started'
          )`,
        ),
      )
      .run();
  }
}

function asNonEmptyBatch(
  statements: BatchItem<"sqlite">[],
): NonEmptySqliteBatch {
  return statements as NonEmptySqliteBatch;
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
