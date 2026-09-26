import type { ConcernReaction } from "../entity/concern-reaction";
import type { LearningEvent } from "../entity/learning-event";

export interface InsertConcernReactionResult {
  created: boolean;
  reactionCount: number;
}

/**
 * Application層が必要とするリアクション永続化処理のPort。
 * 対象投稿が公開中でなければ null を返す。
 */
export interface ConcernReactionRepository {
  insert(
    reaction: ConcernReaction,
    event: LearningEvent,
  ): Promise<InsertConcernReactionResult | null>;
}
