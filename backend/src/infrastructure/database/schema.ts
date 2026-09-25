import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// _health はDBへの疎通確認専用のテーブル。
// 中身にデータが入っている必要はなく、SELECTが成功することが
// D1バインディングへの疎通確認となる(Firestore版の`_health/ping`と同じ考え方)。
export const health = sqliteTable("_health", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  checkedAt: text("checked_at").notNull(),
});

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    lineUserId: text("line_user_id").notNull(),
    displayLanguage: text("display_language").notNull().default("original"),
    birthYear: integer("birth_year"),
    birthMonth: integer("birth_month"),
    genderCode: text("gender_code"),
    regionCode: text("region_code"),
    friendStatus: text("friend_status"),
    joinedAt: text("joined_at"),
    unfollowedAt: text("unfollowed_at"),
    lastSeenAt: text("last_seen_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    lineUserIdIndex: uniqueIndex("users_line_user_id_idx").on(table.lineUserId),
    displayLanguageCheck: check(
      "users_display_language_check",
      sql`${table.displayLanguage} in ('original', 'jaHira', 'en')`,
    ),
  }),
);
export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    tokenHash: text("token_hash").notNull(),
    userId: text("user_id").references(() => users.id),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull(),
    revokedAt: text("revoked_at"),
  },
  (table) => ({
    tokenHashIndex: uniqueIndex("sessions_token_hash_idx").on(table.tokenHash),
    userIdIndex: index("sessions_user_id_idx").on(table.userId),
  }),
);

export const concernClusters = sqliteTable(
  "concern_clusters",
  {
    id: text("id").primaryKey(),
    legacyLabel: text("legacy_label").notNull(),
    legacySummary: text("legacy_summary").notNull(),
    label: text("label"),
    summary: text("summary"),
    status: text("status").notNull().default("ready"),
    modelVersion: text("model_version"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    statusIndex: index("concern_clusters_status_idx").on(table.status),
  }),
);

export const concerns = sqliteTable(
  "concerns",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    body: text("body").notNull(),
    ageGroup: text("age_group"),
    genderCode: text("gender_code"),
    regionCode: text("region_code"),
    clusterId: text("cluster_id").references(() => concernClusters.id),
    embeddingVersion: text("embedding_version"),
    visibilityStatus: text("visibility_status").notNull().default("published"),
    processingStatus: text("processing_status").notNull().default("pending"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    feedIndex: index("concerns_feed_idx").on(
      table.visibilityStatus,
      table.createdAt,
      table.id,
    ),
    regionFeedIndex: index("concerns_region_feed_idx").on(
      table.regionCode,
      table.visibilityStatus,
      table.createdAt,
      table.id,
    ),
    clusterFeedIndex: index("concerns_cluster_feed_idx").on(
      table.clusterId,
      table.visibilityStatus,
      table.createdAt,
      table.id,
    ),
    userIndex: index("concerns_user_idx").on(table.userId, table.createdAt),
    ageGroupCheck: check(
      "concerns_age_group_check",
      sql`${table.ageGroup} is null or ${table.ageGroup} in ('10s', '20s', '30s', '40s', '50s', '60s', '70s', '80s', '90s_plus', 'no_answer')`,
    ),
    genderCodeCheck: check(
      "concerns_gender_code_check",
      sql`${table.genderCode} is null or ${table.genderCode} in ('male', 'female', 'non_binary', 'other', 'no_answer')`,
    ),
    visibilityStatusCheck: check(
      "concerns_visibility_status_check",
      sql`${table.visibilityStatus} in ('pending', 'published', 'hidden', 'deleted')`,
    ),
    processingStatusCheck: check(
      "concerns_processing_status_check",
      sql`${table.processingStatus} in ('pending', 'processing', 'ready', 'failed')`,
    ),
  }),
);

export const concernRepresentations = sqliteTable(
  "concern_representations",
  {
    concernId: text("concern_id")
      .notNull()
      .references(() => concerns.id),
    locale: text("locale").notNull(),
    body: text("body").notNull(),
    status: text("status").notNull().default("ready"),
    errorCode: text("error_code"),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    primaryKey: primaryKey({ columns: [table.concernId, table.locale] }),
    localeCheck: check(
      "concern_representations_locale_check",
      sql`${table.locale} in ('ja-Hira', 'en')`,
    ),
    statusCheck: check(
      "concern_representations_status_check",
      sql`${table.status} in ('ready', 'failed')`,
    ),
  }),
);

export const concernViews = sqliteTable(
  "concern_views",
  {
    concernId: text("concern_id")
      .notNull()
      .references(() => concerns.id),
    actorKey: text("actor_key")
      .notNull()
      .references(() => users.id),
    viewedAt: text("viewed_at").notNull(),
  },
  (table) => ({
    concernActorUniqueIndex: uniqueIndex("concern_views_concern_actor_idx").on(
      table.concernId,
      table.actorKey,
    ),
    actorViewedAtIndex: index("concern_views_actor_viewed_at_idx").on(
      table.actorKey,
      table.viewedAt,
    ),
  }),
);

export const concernReactions = sqliteTable(
  "concern_reactions",
  {
    concernId: text("concern_id")
      .notNull()
      .references(() => concerns.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    reactionType: text("reaction_type").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => ({
    primaryKey: primaryKey({
      columns: [table.concernId, table.userId, table.reactionType],
    }),
    reactionTypeCheck: check(
      "concern_reactions_type_check",
      sql.raw("reaction_type in ('empathy')"),
    ),
    userIndex: index("reactions_user_idx").on(table.userId, table.createdAt),
  }),
);

export const feedImpressions = sqliteTable(
  "feed_impressions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    concernId: text("concern_id")
      .notNull()
      .references(() => concerns.id),
    strategy: text("strategy").notNull(),
    reasonCode: text("reason_code").notNull(),
    algorithmVersion: text("algorithm_version").notNull(),
    position: integer("position").notNull(),
    exposedAt: text("exposed_at").notNull(),
    openedAt: text("opened_at"),
  },
  (table) => ({
    userIndex: index("feed_impressions_user_idx").on(
      table.userId,
      table.exposedAt,
    ),
  }),
);

export const quizzes = sqliteTable(
  "quizzes",
  {
    id: text("id").primaryKey(),
    quizDate: text("quiz_date").notNull(),
    status: text("status").notNull().default("draft"),
    createdAt: text("created_at").notNull(),
    publishedAt: text("published_at"),
    hiddenAt: text("hidden_at"),
  },
  (table) => ({
    quizDateIndex: uniqueIndex("quizzes_quiz_date_idx").on(table.quizDate),
    statusDateIndex: index("quizzes_status_date_idx").on(
      table.status,
      table.quizDate,
    ),
    statusCheck: check(
      "quizzes_status_check",
      sql`${table.status} in ('draft', 'published', 'closed', 'hidden')`,
    ),
  }),
);

export const quizParticipants = sqliteTable(
  "quiz_participants",
  {
    id: text("id").primaryKey(),
    quizId: text("quiz_id")
      .notNull()
      .references(() => quizzes.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    concernId: text("concern_id")
      .notNull()
      .references(() => concerns.id),
    displayOrder: integer("display_order").notNull(),
    ageGroupSnapshot: text("age_group_snapshot"),
    genderSnapshot: text("gender_snapshot"),
    regionCodeSnapshot: text("region_code_snapshot"),
    explanation: text("explanation").notNull(),
  },
  (table) => ({
    quizUserIndex: uniqueIndex("quiz_participants_quiz_user_idx").on(
      table.quizId,
      table.userId,
    ),
    quizConcernIndex: uniqueIndex("quiz_participants_quiz_concern_idx").on(
      table.quizId,
      table.concernId,
    ),
    quizParticipantIndex: uniqueIndex("quiz_participants_quiz_id_idx").on(
      table.id,
      table.quizId,
    ),
    displayOrderCheck: check(
      "quiz_participants_display_order_check",
      sql`${table.displayOrder} between 1 and 3`,
    ),
    ageGroupCheck: check(
      "quiz_participants_age_group_check",
      sql`${table.ageGroupSnapshot} is null or ${table.ageGroupSnapshot} in ('10s', '20s', '30s', '40s', '50s', '60s', '70s', '80s', '90s_plus', 'no_answer')`,
    ),
    genderCheck: check(
      "quiz_participants_gender_check",
      sql`${table.genderSnapshot} is null or ${table.genderSnapshot} in ('male', 'female', 'non_binary', 'other', 'no_answer')`,
    ),
  }),
);

export const quizOptions = sqliteTable(
  "quiz_options",
  {
    quizId: text("quiz_id")
      .notNull()
      .references(() => quizzes.id),
    concernId: text("concern_id")
      .notNull()
      .references(() => concerns.id),
    displayOrder: integer("display_order").notNull(),
  },
  (table) => ({
    primaryKey: primaryKey({ columns: [table.quizId, table.concernId] }),
    participantForeignKey: foreignKey({
      columns: [table.quizId, table.concernId],
      foreignColumns: [quizParticipants.quizId, quizParticipants.concernId],
      name: "quiz_options_participant_fk",
    }),
    displayOrderIndex: uniqueIndex("quiz_options_quiz_order_idx").on(
      table.quizId,
      table.displayOrder,
    ),
    displayOrderCheck: check(
      "quiz_options_display_order_check",
      sql`${table.displayOrder} between 1 and 3`,
    ),
  }),
);

export const quizAttempts = sqliteTable(
  "quiz_attempts",
  {
    id: text("id").primaryKey(),
    quizId: text("quiz_id")
      .notNull()
      .references(() => quizzes.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    score: integer("score").notNull(),
    answeredAt: text("answered_at").notNull(),
  },
  (table) => ({
    quizUserIndex: uniqueIndex("quiz_attempts_quiz_user_idx").on(
      table.quizId,
      table.userId,
    ),
    attemptQuizIndex: uniqueIndex("quiz_attempts_id_quiz_idx").on(
      table.id,
      table.quizId,
    ),
    scoreCheck: check(
      "quiz_attempts_score_check",
      sql`${table.score} between 0 and 3`,
    ),
  }),
);

export const quizAnswers = sqliteTable(
  "quiz_answers",
  {
    attemptId: text("attempt_id").notNull(),
    quizId: text("quiz_id").notNull(),
    participantId: text("participant_id").notNull(),
    selectedConcernId: text("selected_concern_id").notNull(),
    isCorrect: integer("is_correct").notNull(),
  },
  (table) => ({
    primaryKey: primaryKey({ columns: [table.attemptId, table.participantId] }),
    attemptForeignKey: foreignKey({
      columns: [table.attemptId, table.quizId],
      foreignColumns: [quizAttempts.id, quizAttempts.quizId],
      name: "quiz_answers_attempt_quiz_fk",
    }),
    participantForeignKey: foreignKey({
      columns: [table.participantId, table.quizId],
      foreignColumns: [quizParticipants.id, quizParticipants.quizId],
      name: "quiz_answers_participant_quiz_fk",
    }),
    concernForeignKey: foreignKey({
      columns: [table.quizId, table.selectedConcernId],
      foreignColumns: [quizOptions.quizId, quizOptions.concernId],
      name: "quiz_answers_option_fk",
    }),
    correctCheck: check(
      "quiz_answers_is_correct_check",
      sql`${table.isCorrect} in (0, 1)`,
    ),
  }),
);

export const lineWebhookEvents = sqliteTable(
  "line_webhook_events",
  {
    webhookEventId: text("webhook_event_id").primaryKey(),
    userId: text("user_id").references(() => users.id),
    eventType: text("event_type").notNull(),
    status: text("status").notNull(),
    receivedAt: text("received_at").notNull(),
    processedAt: text("processed_at"),
    errorCode: text("error_code"),
  },
  (table) => ({
    userReceivedIndex: index("line_webhook_events_user_received_idx").on(
      table.userId,
      table.receivedAt,
    ),
    statusCheck: check(
      "line_webhook_events_status_check",
      sql`${table.status} in ('received', 'processed', 'ignored', 'failed')`,
    ),
  }),
);

export const lineBroadcasts = sqliteTable(
  "line_broadcasts",
  {
    id: text("id").primaryKey(),
    quizId: text("quiz_id")
      .notNull()
      .references(() => quizzes.id),
    idempotencyKey: text("idempotency_key").notNull(),
    status: text("status").notNull().default("pending"),
    claimToken: text("claim_token"),
    leaseExpiresAt: text("lease_expires_at"),
    requestedAt: text("requested_at").notNull(),
    sentAt: text("sent_at"),
    finishedAt: text("finished_at"),
    lastError: text("last_error"),
  },
  (table) => ({
    quizIndex: uniqueIndex("line_broadcasts_quiz_idx").on(table.quizId),
    idempotencyIndex: uniqueIndex("line_broadcasts_idempotency_idx").on(
      table.idempotencyKey,
    ),
    statusRequestedIndex: index("line_broadcasts_status_requested_idx").on(
      table.status,
      table.requestedAt,
    ),
    statusCheck: check(
      "line_broadcasts_status_check",
      sql`${table.status} in ('pending', 'running', 'succeeded', 'failed')`,
    ),
    leaseCheck: check(
      "line_broadcasts_lease_check",
      sql`(${table.status} = 'running' and ${table.claimToken} is not null and ${table.leaseExpiresAt} is not null) or (${table.status} <> 'running' and ${table.claimToken} is null and ${table.leaseExpiresAt} is null)`,
    ),
  }),
);

export const lineBroadcastAttempts = sqliteTable(
  "line_broadcast_attempts",
  {
    id: text("id").primaryKey(),
    broadcastId: text("broadcast_id")
      .notNull()
      .references(() => lineBroadcasts.id),
    attemptNumber: integer("attempt_number").notNull(),
    status: text("status").notNull(),
    httpStatus: integer("http_status"),
    lineRequestId: text("line_request_id"),
    lineAcceptedRequestId: text("line_accepted_request_id"),
    lineRetryKey: text("line_retry_key").notNull(),
    attemptedAt: text("attempted_at").notNull(),
    errorMessage: text("error_message"),
  },
  (table) => ({
    numberIndex: uniqueIndex("line_broadcast_attempts_number_idx").on(
      table.broadcastId,
      table.attemptNumber,
    ),
    retryKeyIndex: uniqueIndex("line_broadcast_attempts_retry_key_idx").on(
      table.lineRetryKey,
    ),
    statusAttemptedIndex: index(
      "line_broadcast_attempts_status_attempted_idx",
    ).on(table.status, table.attemptedAt),
    statusCheck: check(
      "line_broadcast_attempts_status_check",
      sql`${table.status} in ('started', 'succeeded', 'failed')`,
    ),
    attemptNumberCheck: check(
      "line_broadcast_attempts_number_check",
      sql`${table.attemptNumber} > 0`,
    ),
  }),
);
