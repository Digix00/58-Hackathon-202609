import { describe, expect, it, vi } from "vitest";

import type { SpeechAudioDurationReader } from "../../../src/application/port/speech-audio-duration-reader";
import type { SpeechRateLimiter } from "../../../src/application/port/speech-rate-limiter";
import type { SpeechRecognizer } from "../../../src/application/port/speech-recognizer";
import {
  InvalidSpeechAudioError,
  SpeechAudioTooLongError,
  SpeechRecognitionUnavailableError,
  SpeechUseCase,
} from "../../../src/application/usecase/speech.usecase";

const audio = new Uint8Array([1, 2, 3]).buffer;

function createUseCase(
  options: {
    recognizer?: SpeechRecognizer | null;
    durationSeconds?: number;
    rateLimitAllowed?: boolean;
    rateLimitRetryAfterSeconds?: number;
    durationReadError?: Error;
  } = {},
) {
  const transcribe = vi.fn(async (_audio: ArrayBuffer) => " 文字起こし結果 ");
  const recognizer =
    options.recognizer === undefined ? { transcribe } : options.recognizer;
  const durationReader: SpeechAudioDurationReader = {
    getDurationSeconds: vi.fn(async () => {
      if (options.durationReadError) {
        throw options.durationReadError;
      }
      return options.durationSeconds ?? 1;
    }),
  };
  const rateLimiter: SpeechRateLimiter = {
    consume: vi.fn(async () =>
      options.rateLimitAllowed === false
        ? {
            allowed: false as const,
            retryAfterSeconds: options.rateLimitRetryAfterSeconds ?? 60,
          }
        : { allowed: true as const },
    ),
  };

  return {
    useCase: new SpeechUseCase(recognizer, durationReader, rateLimiter),
    transcribe,
    durationReader,
    rateLimiter,
  };
}

describe("SpeechUseCase", () => {
  it("validates duration and rate limit before transcribing", async () => {
    const { useCase, transcribe, durationReader, rateLimiter } = createUseCase({
      durationSeconds: 60,
    });

    await expect(
      useCase.transcribe("user-1", audio, "audio/webm"),
    ).resolves.toBe("文字起こし結果");
    expect(durationReader.getDurationSeconds).toHaveBeenCalledWith(
      new Uint8Array(audio),
      "audio/webm",
    );
    expect(rateLimiter.consume).toHaveBeenCalledWith("user-1");
    expect(transcribe).toHaveBeenCalledWith(audio);
  });

  it("rejects malformed or overlong audio before consuming a rate limit slot", async () => {
    const malformed = createUseCase({
      durationReadError: new Error("malformed audio"),
    });
    await expect(
      malformed.useCase.transcribe("user-1", audio, "audio/wav"),
    ).rejects.toBeInstanceOf(InvalidSpeechAudioError);
    expect(malformed.rateLimiter.consume).not.toHaveBeenCalled();
    expect(malformed.transcribe).not.toHaveBeenCalled();

    const overlong = createUseCase({ durationSeconds: 60.001 });
    await expect(
      overlong.useCase.transcribe("user-1", audio, "audio/wav"),
    ).rejects.toBeInstanceOf(SpeechAudioTooLongError);
    expect(overlong.rateLimiter.consume).not.toHaveBeenCalled();
    expect(overlong.transcribe).not.toHaveBeenCalled();
  });

  it("rejects a rate-limited user before calling the recognizer", async () => {
    const { useCase, transcribe, rateLimiter } = createUseCase({
      rateLimitAllowed: false,
      rateLimitRetryAfterSeconds: 17,
    });

    await expect(
      useCase.transcribe("user-1", audio, "audio/wav"),
    ).rejects.toMatchObject({
      retryAfterSeconds: 17,
    });
    expect(rateLimiter.consume).toHaveBeenCalledWith("user-1");
    expect(transcribe).not.toHaveBeenCalled();
  });

  it("fails when recognition is unavailable or returns no text", async () => {
    const unavailable = createUseCase({ recognizer: null });
    await expect(
      unavailable.useCase.transcribe("user-1", audio, "audio/wav"),
    ).rejects.toBeInstanceOf(SpeechRecognitionUnavailableError);
    expect(
      unavailable.durationReader.getDurationSeconds,
    ).not.toHaveBeenCalled();
    expect(unavailable.rateLimiter.consume).not.toHaveBeenCalled();

    const emptyResult = createUseCase({
      recognizer: { transcribe: async () => "  " },
    });
    await expect(
      emptyResult.useCase.transcribe("user-1", audio, "audio/wav"),
    ).rejects.toBeInstanceOf(SpeechRecognitionUnavailableError);
  });
});
