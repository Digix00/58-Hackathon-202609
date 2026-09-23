export const REACTION_TYPES = ["empathy"] as const;
export type ReactionType = (typeof REACTION_TYPES)[number];

export interface ConcernReactionProps {
  concernId: string;
  userId: string;
  reactionType: ReactionType;
  createdAt: string;
}

/** A user's one reaction to a published concern. */
export class ConcernReaction {
  readonly concernId: string;
  readonly userId: string;
  readonly reactionType: ReactionType;
  readonly createdAt: string;

  constructor(props: ConcernReactionProps) {
    this.concernId = props.concernId;
    this.userId = props.userId;
    this.reactionType = props.reactionType;
    this.createdAt = props.createdAt;
  }
}
