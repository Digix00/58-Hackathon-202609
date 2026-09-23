import { sql } from "drizzle-orm";
import {
  check,
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
    birthYear: integer("birth_year"),
    birthMonth: integer("birth_month"),
    genderCode: text("gender_code"),
    regionCode: text("region_code"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    lineUserIdIndex: uniqueIndex("users_line_user_id_idx").on(table.lineUserId),
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
    label: text("label").notNull(),
    summary: text("summary").notNull(),
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
