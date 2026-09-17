import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";

// _health はDBへの疎通確認専用のテーブル。
// 中身にデータが入っている必要はなく、SELECTが成功することが
// D1バインディングへの疎通確認となる(Firestore版の`_health/ping`と同じ考え方)。
export const health = sqliteTable("_health", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  checkedAt: text("checked_at").notNull(),
});
