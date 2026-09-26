import type {
  SpeechRateLimiter,
  SpeechRateLimitResult,
} from "../../application/port/speech-rate-limiter";

const MINUTE_WINDOW_MS = 60_000;
const DAY_WINDOW_MS = 24 * 60 * MINUTE_WINDOW_MS;
const MAX_TRANSCRIPTIONS_PER_MINUTE = 10;
const MAX_TRANSCRIPTIONS_PER_DAY = 200;

type RateLimitCounts = {
  minuteCount: number;
  oldestMinuteRequest: number | null;
  dayCount: number;
  oldestDayRequest: number | null;
};

/** Applies rolling per-user limits using D1 as the shared, atomic counter store. */
export class D1SpeechRateLimiter implements SpeechRateLimiter {
  private readonly db: D1Database;
  private readonly now: () => number;

  constructor(db: D1Database, now: () => number = Date.now) {
    this.db = db;
    this.now = now;
  }

  async consume(userId: string): Promise<SpeechRateLimitResult> {
    const now = this.now();
    const minuteCutoff = now - MINUTE_WINDOW_MS;
    const dayCutoff = now - DAY_WINDOW_MS;

    const results = await this.db.batch([
      this.db
        .prepare(
          `DELETE FROM speech_transcription_rate_limit_events
           WHERE created_at <= ?`,
        )
        .bind(dayCutoff),
      this.db
        .prepare(
          `INSERT INTO speech_transcription_rate_limit_events (user_id, created_at)
           SELECT ?, ?
           WHERE (
             SELECT COUNT(*)
             FROM speech_transcription_rate_limit_events
             WHERE user_id = ? AND created_at > ?
           ) < ?
           AND (
             SELECT COUNT(*)
             FROM speech_transcription_rate_limit_events
             WHERE user_id = ? AND created_at > ?
           ) < ?`,
        )
        .bind(
          userId,
          now,
          userId,
          minuteCutoff,
          MAX_TRANSCRIPTIONS_PER_MINUTE,
          userId,
          dayCutoff,
          MAX_TRANSCRIPTIONS_PER_DAY,
        ),
    ]);

    if (results[1]?.meta.changes === 1) {
      return { allowed: true };
    }

    const counts = await this.db
      .prepare(
        `SELECT
           COUNT(CASE WHEN created_at > ? THEN 1 END) AS minute_count,
           MIN(CASE WHEN created_at > ? THEN created_at END) AS oldest_minute_request,
           COUNT(CASE WHEN created_at > ? THEN 1 END) AS day_count,
           MIN(CASE WHEN created_at > ? THEN created_at END) AS oldest_day_request
         FROM speech_transcription_rate_limit_events
         WHERE user_id = ?`,
      )
      .bind(minuteCutoff, minuteCutoff, dayCutoff, dayCutoff, userId)
      .first<{
        minute_count: number;
        oldest_minute_request: number | null;
        day_count: number;
        oldest_day_request: number | null;
      }>();

    if (!counts) {
      throw new Error("Speech rate limit state is unavailable");
    }

    const rateLimitCounts: RateLimitCounts = {
      minuteCount: counts.minute_count,
      oldestMinuteRequest: counts.oldest_minute_request,
      dayCount: counts.day_count,
      oldestDayRequest: counts.oldest_day_request,
    };
    const retryAfterSeconds = getRetryAfterSeconds(rateLimitCounts, now);
    if (retryAfterSeconds === 0) {
      // The conditional insert and this read use the same timestamp. A zero
      // delay therefore indicates that the database returned an inconsistent
      // result, which must fail closed instead of allowing an uncounted call.
      throw new Error("Speech rate limit could not be determined");
    }

    return { allowed: false, retryAfterSeconds };
  }
}

function getRetryAfterSeconds(counts: RateLimitCounts, now: number): number {
  const retryWindows: number[] = [];

  if (
    counts.minuteCount >= MAX_TRANSCRIPTIONS_PER_MINUTE &&
    counts.oldestMinuteRequest !== null
  ) {
    retryWindows.push(counts.oldestMinuteRequest + MINUTE_WINDOW_MS - now);
  }

  if (
    counts.dayCount >= MAX_TRANSCRIPTIONS_PER_DAY &&
    counts.oldestDayRequest !== null
  ) {
    retryWindows.push(counts.oldestDayRequest + DAY_WINDOW_MS - now);
  }

  return retryWindows.length === 0
    ? 0
    : Math.max(1, Math.ceil(Math.max(...retryWindows) / 1000));
}
