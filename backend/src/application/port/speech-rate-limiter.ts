export type SpeechRateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

/** Atomically consumes one transcription attempt for an authenticated user. */
export interface SpeechRateLimiter {
  consume(userId: string): Promise<SpeechRateLimitResult>;
}
