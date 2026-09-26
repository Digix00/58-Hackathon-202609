import type { SpeechAudioDurationReader } from "../port/speech-audio-duration-reader";
import {
  MAX_SPEECH_AUDIO_DURATION_SECONDS,
  SpeechAudioDurationLimitExceededError,
} from "../port/speech-audio-duration-reader";
import type { SpeechRateLimiter } from "../port/speech-rate-limiter";
import type { SpeechRecognizer } from "../port/speech-recognizer";

export class SpeechRecognitionUnavailableError extends Error {
  constructor() {
    super("Speech recognition is unavailable");
    this.name = "SpeechRecognitionUnavailableError";
  }
}

export class InvalidSpeechAudioError extends Error {
  constructor() {
    super("Speech audio metadata is invalid");
    this.name = "InvalidSpeechAudioError";
  }
}

export class SpeechAudioTooLongError extends Error {
  constructor() {
    super("Speech audio exceeds the maximum duration");
    this.name = "SpeechAudioTooLongError";
  }
}

export class SpeechRateLimitExceededError extends Error {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super("Speech transcription rate limit exceeded");
    this.name = "SpeechRateLimitExceededError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export interface ISpeechUseCase {
  admitRequest(userId: string): Promise<void>;
  transcribe(audio: ArrayBuffer, mimeType: string): Promise<string>;
}

export class SpeechUseCase implements ISpeechUseCase {
  private readonly recognizer: SpeechRecognizer | null;
  private readonly audioDurationReader: SpeechAudioDurationReader;
  private readonly rateLimiter: SpeechRateLimiter;

  constructor(
    recognizer: SpeechRecognizer | null,
    audioDurationReader: SpeechAudioDurationReader,
    rateLimiter: SpeechRateLimiter,
  ) {
    this.recognizer = recognizer;
    this.audioDurationReader = audioDurationReader;
    this.rateLimiter = rateLimiter;
  }

  async admitRequest(userId: string): Promise<void> {
    const rateLimit = await this.rateLimiter.consume(userId);
    if (!rateLimit.allowed) {
      throw new SpeechRateLimitExceededError(rateLimit.retryAfterSeconds);
    }
  }

  async transcribe(audio: ArrayBuffer, mimeType: string): Promise<string> {
    if (!this.recognizer) {
      throw new SpeechRecognitionUnavailableError();
    }

    let duration: number;
    try {
      duration = await this.audioDurationReader.getDurationSeconds(
        new Uint8Array(audio),
        mimeType,
      );
    } catch (error) {
      if (error instanceof SpeechAudioDurationLimitExceededError) {
        throw new SpeechAudioTooLongError();
      }
      throw new InvalidSpeechAudioError();
    }
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new InvalidSpeechAudioError();
    }
    if (duration > MAX_SPEECH_AUDIO_DURATION_SECONDS) {
      throw new SpeechAudioTooLongError();
    }

    const text = (await this.recognizer.transcribe(audio)).trim();
    if (text.length === 0) {
      throw new SpeechRecognitionUnavailableError();
    }

    return text;
  }
}
