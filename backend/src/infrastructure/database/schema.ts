import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
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

export const concerns = sqliteTable(
  "concerns",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    body: text("body").notNull(),
    inputMethod: text("input_method").notNull(),
    ageGroup: text("age_group"),
    genderCode: text("gender_code"),
    regionCode: text("region_code"),
    visibilityStatus: text("visibility_status")
      .notNull()
      .default("published"),
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
    userIndex: index("concerns_user_idx").on(table.userId, table.createdAt),
    inputMethodCheck: check(
      "concerns_input_method_check",
      sql`${table.inputMethod} in ('liff', 'voice')`,
    ),
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
