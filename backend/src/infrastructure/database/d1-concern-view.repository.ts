import { ConcernView } from "../../application/entity/concern-view";
import type { ConcernViewRepository } from "../../application/repository/concern-view.repository";

interface ConcernViewRow {
  concern_id: string;
  actor_key: string;
  viewed_at: string;
}

/** D1で公開中の投稿に対する既読を一度だけ記録するAdapter。 */
export class D1ConcernViewRepository implements ConcernViewRepository {
  private readonly database: D1Database;

  constructor(database: D1Database) {
    this.database = database;
  }

  async recordForPublishedConcern(
    view: ConcernView,
  ): Promise<ConcernView | null> {
    // 公開状態の検査、初回INSERT、重複時の既存日時維持を一つのSQL文で行う。
    const row = await this.database
      .prepare(
        `INSERT INTO concern_views (concern_id, actor_key, viewed_at)
         SELECT ?, ?, ?
         FROM concerns
         WHERE concerns.id = ? AND concerns.visibility_status = 'published'
         ON CONFLICT (concern_id, actor_key)
         DO UPDATE SET viewed_at = concern_views.viewed_at
         RETURNING concern_id, actor_key, viewed_at`,
      )
      .bind(view.concernId, view.actorKey, view.viewedAt, view.concernId)
      .first<ConcernViewRow>();

    return row
      ? new ConcernView({
          concernId: row.concern_id,
          actorKey: row.actor_key,
          viewedAt: row.viewed_at,
        })
      : null;
  }
}
