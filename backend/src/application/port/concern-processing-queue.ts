export const CONCERN_PROCESSING_MESSAGE_TYPE = "concern.process" as const;

export interface ConcernProcessingMessage {
  type: typeof CONCERN_PROCESSING_MESSAGE_TYPE;
  concernId: string;
  body: string;
}

/** Publishes post-processing work without exposing the Queue binding. */
export interface ConcernProcessingQueue {
  enqueue(message: ConcernProcessingMessage): Promise<void>;
}
