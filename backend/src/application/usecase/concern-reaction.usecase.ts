import { ConcernReaction, type ReactionType } from "../entity/concern-reaction";
import type { ConcernReactionRepository } from "../repository/concern-reaction.repository";

export interface RegisterConcernReactionInput {
  concernId: string;
  userId: string;
  reactionType: ReactionType;
}

export interface RegisterConcernReactionOutput {
  reaction: ConcernReaction;
  created: boolean;
  reactionCount: number;
}

export interface IConcernReactionUseCase {
  register(
    input: RegisterConcernReactionInput,
  ): Promise<RegisterConcernReactionOutput | null>;
}

/** 悩みへのリアクション登録と、その冪等な結果を組み立てる。 */
export class ConcernReactionUseCase implements IConcernReactionUseCase {
  private readonly repository: ConcernReactionRepository;
  private readonly now: () => Date;

  constructor(
    repository: ConcernReactionRepository,
    now: () => Date = () => new Date(),
  ) {
    this.repository = repository;
    this.now = now;
  }

  readonly register = async (
    input: RegisterConcernReactionInput,
  ): Promise<RegisterConcernReactionOutput | null> => {
    const reaction = new ConcernReaction({
      concernId: input.concernId,
      userId: input.userId,
      reactionType: input.reactionType,
      createdAt: this.now().toISOString(),
    });
    const result = await this.repository.insert(reaction);

    if (!result) {
      return null;
    }

    return {
      reaction,
      created: result.created,
      reactionCount: result.reactionCount,
    };
  };
}
