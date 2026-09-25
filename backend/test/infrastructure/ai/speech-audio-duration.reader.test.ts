import { describe, expect, it } from "vitest";

import { SpeechAudioDurationLimitExceededError } from "../../../src/application/port/speech-audio-duration-reader";
import { VerifiedSpeechAudioDurationReader } from "../../../src/infrastructure/ai/speech-audio-duration.reader";
import { MAX_WEBM_EBML_ELEMENT_VISITS } from "../../../src/infrastructure/ai/webm-opus-speech-audio-duration";
import {
  createMp3Audio,
  createMp4Audio,
  createWavAudio,
  createWebmAudio,
} from "../../support/audio-fixture";

const reader = new VerifiedSpeechAudioDurationReader();

describe("VerifiedSpeechAudioDurationReader", () => {
  it.each([
    ["WAV", "audio/wav", createWavAudio(60), 60],
    ["WebM Opus", "audio/webm", createWebmAudio(1), 1],
    ["MP4 samples", "audio/mp4", createMp4Audio(1), 1.003],
    ["MPEG frames", "audio/mpeg", createMp3Audio(1), 1.018],
  ])(
    "calculates duration from %s sample data",
    async (_name, mimeType, audio, expected) => {
      const duration = await reader.getDurationSeconds(
        audio as Uint8Array,
        mimeType as string,
      );

      expect(duration).toBeCloseTo(expected as number, 2);
    },
  );

  it("rejects WebM with more EBML elements than the parser budget", async () => {
    const audio = createWebmAudio(1, 1, MAX_WEBM_EBML_ELEMENT_VISITS + 1);

    await expect(
      reader.getDurationSeconds(audio, "audio/webm"),
    ).rejects.toThrow("Too many WebM EBML elements");
  });

  it("rejects a WAV blockAlign that disagrees with its PCM sample format", async () => {
    const audio = createWavAudio(61);
    const view = new DataView(audio.buffer, audio.byteOffset, audio.byteLength);
    view.setUint16(32, 4, true);
    view.setUint32(28, 32_000, true);

    await expect(
      reader.getDurationSeconds(audio, "audio/wav"),
    ).rejects.toThrow();
  });

  it("rejects a WAV byteRate that disagrees with its sample rate and blockAlign", async () => {
    const audio = createWavAudio(1);
    const view = new DataView(audio.buffer, audio.byteOffset, audio.byteLength);
    view.setUint32(28, 16_001, true);

    await expect(
      reader.getDurationSeconds(audio, "audio/wav"),
    ).rejects.toThrow();
  });

  it("reports verified MP4 samples over 60 seconds as a duration limit error", async () => {
    await expect(
      reader.getDurationSeconds(createMp4Audio(65, 1), "audio/mp4"),
    ).rejects.toBeInstanceOf(SpeechAudioDurationLimitExceededError);
  });

  it.each([["WebM", "audio/webm", createWebmAudio(61, 1)]])(
    "ignores a shortened container duration when %s sample data exceeds 60 seconds",
    async (_name, mimeType, audio) => {
      const duration = await reader.getDurationSeconds(
        audio as Uint8Array,
        mimeType as string,
      );

      expect(duration).toBeGreaterThan(60);
    },
  );

  it.each([
    ["empty WAV", "audio/wav", new Uint8Array()],
    ["MP4 without samples", "audio/mp4", createMp4Audio(0)],
    ["WebM without packets", "audio/webm", createWebmAudio(0)],
    ["malformed bytes", "audio/webm", Uint8Array.of(1, 2, 3)],
  ])(
    "rejects %s instead of trusting container metadata",
    async (_name, mimeType, audio) => {
      await expect(
        reader.getDurationSeconds(audio as Uint8Array, mimeType as string),
      ).rejects.toThrow();
    },
  );
});
