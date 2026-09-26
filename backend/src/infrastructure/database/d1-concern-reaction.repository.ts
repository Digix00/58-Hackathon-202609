import { and, count, eq, exists } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import type { ConcernReaction } from "../../application/entity/concern-reaction";
import type { LearningEvent } from "../../application/entity/learning-event";
import type {
  ConcernReactionRepository,
  InsertConcernReactionResult,
  RemoveConcernReactionResult,
} from "../../application/repository/concern-reaction.repository";
import { concernReactions, concerns, learningEvents } from "./schema";

/** D1/Drizzleを使ったConcernReactionRepositoryの実装。 */
export class D1ConcernReactionRepository implements ConcernReactionRepository {
  private readonly db: ReturnType<typeof drizzle>;
  private readonly database: D1Database;

  constructor(d1: D1Database) {
    this.database = d1;
    this.db = drizzle(d1);
  }

  async insert(
    reaction: ConcernReaction,
    event: LearningEvent,
  ): Promise<InsertConcernReactionResult | null> {
    const publishedConcern = await this.db
      .select({ id: concerns.id })
      .from(concerns)
      .where(
        and(
          eq(concerns.id, reaction.concernId),
          eq(concerns.visibilityStatus, "published"),
        ),
      )
      .limit(1)
      .get();

    if (!publishedConcern) {
      return null;
    }

    const [inserted] = await this.database.batch([
      this.database
        .prepare(
          "INSERT INTO concern_reactions " +
            "(concern_id, user_id, reaction_type, created_at) " +
            "SELECT ?, ?, ?, ? FROM concerns " +
            "WHERE concerns.id = ? AND concerns.visibility_status = 'published' " +
            "ON CONFLICT DO NOTHING",
        )
        .bind(
          reaction.concernId,
          reaction.userId,
          reaction.reactionType,
          reaction.createdAt,
          reaction.concernId,
        ),
      this.database
        .prepare(
          "INSERT INTO learning_events " +
            "(id, user_id, event_type, concern_id, cluster_id, quiz_id, occurred_at) " +
            "SELECT ?, ?, ?, concerns.id, concerns.cluster_id, ?, ? " +
            "FROM concerns WHERE concerns.id = ? " +
            "AND concerns.visibility_status = 'published' " +
            "AND EXISTS (SELECT 1 FROM concern_reactions " +
            "WHERE concern_id = concerns.id AND user_id = ? AND reaction_type = ?) " +
            "AND NOT EXISTS (SELECT 1 FROM learning_events " +
            "WHERE user_id = ? AND event_type = ? AND concern_id = concerns.id) " +
            "AND changes() > 0",
        )
        .bind(
          event.id,
          event.userId,
          event.eventType,
          event.quizId,
          event.occurredAt,
          reaction.concernId,
          reaction.userId,
          reaction.reactionType,
          reaction.userId,
          event.eventType,
        ),
    ]);

    const stillPublished = await this.db
      .select({ id: concerns.id })
      .from(concerns)
      .where(
        and(
          eq(concerns.id, reaction.concernId),
          eq(concerns.visibilityStatus, "published"),
        ),
      )
      .limit(1)
      .get();

    if (!stillPublished) return null;

    const aggregate = await this.db
      .select({ reactionCount: count() })
      .from(concernReactions)
      .where(eq(concernReactions.concernId, reaction.concernId))
      .get();

    return {
      created: inserted.meta.changes > 0,
      reactionCount: aggregate?.reactionCount ?? 0,
    };
  }

  async remove(
    reaction: ConcernReaction,
  ): Promise<RemoveConcernReactionResult | null> {
    const publishedConcern = await this.db
      .select({ id: concerns.id })
      .from(concerns)
      .where(
        and(
          eq(concerns.id, reaction.concernId),
          eq(concerns.visibilityStatus, "published"),
        ),
      )
      .limit(1)
      .get();

    if (!publishedConcern) {
      return null;
    }

    // 非公開へ変わった投稿は履歴から外れて読み返せないため、取り消しの対象にしない。
    const removable = and(
      eq(concernReactions.concernId, reaction.concernId),
      eq(concernReactions.userId, reaction.userId),
      eq(concernReactions.reactionType, reaction.reactionType),
      exists(
        this.db
          .select({ id: concerns.id })
          .from(concerns)
          .where(
            and(
              eq(concerns.id, reaction.concernId),
              eq(concerns.visibilityStatus, "published"),
            ),
          ),
      ),
    );

    /*
     * 学習イベントを先に消す。あとに回すと、消す相手の寄りそいがすでに無く、
     * 「取り消せたときだけ消す」という条件をクエリに書けない。
     */
    const [, removedReactions] = await this.db.batch([
      this.db
        .delete(learningEvents)
        .where(
          and(
            eq(learningEvents.userId, reaction.userId),
            eq(learningEvents.eventType, "reaction"),
            eq(learningEvents.concernId, reaction.concernId),
            exists(
              this.db
                .select({ concernId: concernReactions.concernId })
                .from(concernReactions)
                .where(removable),
            ),
          ),
        ),
      this.db
        .delete(concernReactions)
        .where(removable)
        .returning({ concernId: concernReactions.concernId }),
    ]);

    const aggregate = await this.db
      .select({ reactionCount: count() })
      .from(concernReactions)
      .where(eq(concernReactions.concernId, reaction.concernId))
      .get();

    return {
      removed: removedReactions.length > 0,
      reactionCount: aggregate?.reactionCount ?? 0,
    };
  }
}
