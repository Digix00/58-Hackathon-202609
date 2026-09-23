import type { ConcernReaction } from "../entity/concern-reaction";

export interface RegisterConcernReactionResult {
  created: boolean;
  reactionCount: number;
}

/**
 * Application層が必要とするリアクション永続化処理のPort。
 * 対象投稿が公開中でなければ null を返す。
 */
export interface ConcernReactionRepository {
  register(
    reaction: ConcernReaction,
  ): Promise<RegisterConcernReactionResult | null>;
}
