import { describe, expect, it } from "vitest";

import { VerifiedSpeechAudioDurationReader } from "../../../src/infrastructure/ai/speech-audio-duration.reader";
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

  it.each([
    ["WebM", "audio/webm", createWebmAudio(61, 1)],
    ["MP4", "audio/mp4", createMp4Audio(61, 1)],
  ])(
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
