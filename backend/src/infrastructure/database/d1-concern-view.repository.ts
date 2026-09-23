import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { ConcernView } from "../../application/entity/concern-view";
import type { ConcernViewRepository } from "../../application/repository/concern-view.repository";
import { concerns, concernViews } from "./schema";

/** D1で公開中の投稿に対する既読を一度だけ記録するAdapter。 */
export class D1ConcernViewRepository implements ConcernViewRepository {
  private readonly db: ReturnType<typeof drizzle>;

  constructor(database: D1Database) {
    this.db = drizzle(database);
  }

  async insert(view: ConcernView): Promise<ConcernView | null> {
    // 公開中の投稿だけをINSERTし、重複時は保存済みの日時を維持する。
    const row = await this.db
      .insert(concernViews)
      .select((queryBuilder) =>
        queryBuilder
          .select({
            concernId: sql<string>`${view.concernId}`.as("concern_id"),
            actorKey: sql<string>`${view.actorKey}`.as("actor_key"),
            viewedAt: sql<string>`${view.viewedAt}`.as("viewed_at"),
          })
          .from(concerns)
          .where(
            and(
              eq(concerns.id, view.concernId),
              eq(concerns.visibilityStatus, "published"),
            ),
          ),
      )
      .onConflictDoUpdate({
        target: [concernViews.concernId, concernViews.actorKey],
        set: { viewedAt: sql`${concernViews.viewedAt}` },
      })
      .returning()
      .get();

    return row
      ? new ConcernView({
          concernId: row.concernId,
          actorKey: row.actorKey,
          viewedAt: row.viewedAt,
        })
      : null;
  }
}
