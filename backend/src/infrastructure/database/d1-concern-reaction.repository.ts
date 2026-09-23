import { and, count, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import type { ConcernReaction } from "../../application/entity/concern-reaction";
import type {
  ConcernReactionRepository,
  InsertConcernReactionResult,
} from "../../application/repository/concern-reaction.repository";
import { concernReactions, concerns } from "./schema";

/** D1/Drizzleを使ったConcernReactionRepositoryの実装。 */
export class D1ConcernReactionRepository implements ConcernReactionRepository {
  private readonly db: ReturnType<typeof drizzle>;

  constructor(d1: D1Database) {
    this.db = drizzle(d1);
  }

  async insert(
    reaction: ConcernReaction,
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

    const inserted = await this.db
      .insert(concernReactions)
      .values({
        concernId: reaction.concernId,
        userId: reaction.userId,
        reactionType: reaction.reactionType,
        createdAt: reaction.createdAt,
      })
      .onConflictDoNothing()
      .returning({ concernId: concernReactions.concernId });

    const aggregate = await this.db
      .select({ reactionCount: count() })
      .from(concernReactions)
      .where(eq(concernReactions.concernId, reaction.concernId))
      .get();

    return {
      created: inserted.length > 0,
      reactionCount: aggregate?.reactionCount ?? 0,
    };
  }
}
