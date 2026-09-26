import { ConcernReaction, type ReactionType } from "../entity/concern-reaction";
import { LearningEvent } from "../entity/learning-event";
import type { ConcernReactionRepository } from "../repository/concern-reaction.repository";
import { generateId } from "../shared/id-generator";

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

export interface RemoveConcernReactionInput {
  concernId: string;
  userId: string;
  reactionType: ReactionType;
}

export interface RemoveConcernReactionOutput {
  reaction: ConcernReaction;
  removed: boolean;
  reactionCount: number;
}

export interface IConcernReactionUseCase {
  register(
    input: RegisterConcernReactionInput,
  ): Promise<RegisterConcernReactionOutput | null>;
  remove(
    input: RemoveConcernReactionInput,
  ): Promise<RemoveConcernReactionOutput | null>;
}

/** 悩みへのリアクション登録と、その冪等な結果を組み立てる。 */
export class ConcernReactionUseCase implements IConcernReactionUseCase {
  private readonly repository: ConcernReactionRepository;
  private readonly now: () => Date;
  private readonly createId: () => string;

  constructor(
    repository: ConcernReactionRepository,
    now: () => Date = () => new Date(),
    createId: () => string = generateId,
  ) {
    this.repository = repository;
    this.now = now;
    this.createId = createId;
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
    const result = await this.repository.insert(
      reaction,
      new LearningEvent({
        id: this.createId(),
        userId: input.userId,
        eventType: "reaction",
        concernId: input.concernId,
        occurredAt: reaction.createdAt,
      }),
    );

    if (!result) {
      return null;
    }

    return {
      reaction,
      created: result.created,
      reactionCount: result.reactionCount,
    };
  };

  readonly remove = async (
    input: RemoveConcernReactionInput,
  ): Promise<RemoveConcernReactionOutput | null> => {
    const reaction = new ConcernReaction({
      concernId: input.concernId,
      userId: input.userId,
      reactionType: input.reactionType,
      createdAt: this.now().toISOString(),
    });
    const result = await this.repository.remove(reaction);

    if (!result) {
      return null;
    }

    return {
      reaction,
      removed: result.removed,
      reactionCount: result.reactionCount,
    };
  };
}
