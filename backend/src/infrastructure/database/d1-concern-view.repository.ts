import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { ConcernView } from "../../application/entity/concern-view";
import type { LearningEvent } from "../../application/entity/learning-event";
import type { ConcernViewRepository } from "../../application/repository/concern-view.repository";
import { concerns, concernViews } from "./schema";

/** D1で公開中の投稿に対する既読を一度だけ記録するAdapter。 */
export class D1ConcernViewRepository implements ConcernViewRepository {
  private readonly db: ReturnType<typeof drizzle>;
  private readonly database: D1Database;

  constructor(database: D1Database) {
    this.database = database;
    this.db = drizzle(database);
  }

  async insert(
    view: ConcernView,
    event: LearningEvent,
  ): Promise<ConcernView | null> {
    await this.database.batch([
      this.database
        .prepare(
          "INSERT INTO concern_views (concern_id, actor_key, viewed_at) " +
            "SELECT ?, ?, ? FROM concerns " +
            "WHERE id = ? AND visibility_status = 'published' " +
            "ON CONFLICT (concern_id, actor_key) " +
            "DO NOTHING",
        )
        .bind(view.concernId, view.actorKey, view.viewedAt, view.concernId),
      this.database
        .prepare(
          "INSERT INTO learning_events " +
            "(id, user_id, event_type, concern_id, cluster_id, quiz_id, occurred_at) " +
            "SELECT ?, ?, ?, concerns.id, concerns.cluster_id, ?, ? " +
            "FROM concerns WHERE concerns.id = ? " +
            "AND concerns.visibility_status = 'published' " +
            "AND changes() > 0",
        )
        .bind(
          event.id,
          event.userId,
          event.eventType,
          event.quizId,
          event.occurredAt,
          view.concernId,
        ),
    ]);

    const row = await this.db
      .select({
        concernId: concernViews.concernId,
        actorKey: concernViews.actorKey,
        viewedAt: concernViews.viewedAt,
      })
      .from(concernViews)
      .innerJoin(concerns, eq(concerns.id, concernViews.concernId))
      .where(
        and(
          eq(concernViews.concernId, view.concernId),
          eq(concernViews.actorKey, view.actorKey),
          eq(concerns.visibilityStatus, "published"),
        ),
      )
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
