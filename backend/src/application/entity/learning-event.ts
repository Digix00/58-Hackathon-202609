export const LEARNING_EVENT_TYPES = [
  "view",
  "reaction",
  "quiz_answer",
] as const;
export type LearningEventType = (typeof LEARNING_EVENT_TYPES)[number];

export interface LearningEventProps {
  id: string;
  userId: string;
  eventType: LearningEventType;
  concernId?: string | null;
  clusterId?: string | null;
  quizId?: string | null;
  occurredAt: string;
}

/** 利用者の閲覧・リアクション・クイズ回答の学習イベント。 */
export class LearningEvent {
  readonly id: string;
  readonly userId: string;
  readonly eventType: LearningEventType;
  readonly concernId: string | null;
  readonly clusterId: string | null;
  readonly quizId: string | null;
  readonly occurredAt: string;

  constructor(props: LearningEventProps) {
    if (!props.id.trim() || !props.userId.trim()) {
      throw new TypeError("learning event identity is required");
    }
    if (
      (props.eventType === "quiz_answer" && !props.quizId) ||
      (props.eventType !== "quiz_answer" && !props.concernId)
    ) {
      throw new TypeError("learning event reference is required");
    }

    this.id = props.id;
    this.userId = props.userId;
    this.eventType = props.eventType;
    this.concernId = props.concernId ?? null;
    this.clusterId = props.clusterId ?? null;
    this.quizId = props.quizId ?? null;
    this.occurredAt = props.occurredAt;
  }
}
