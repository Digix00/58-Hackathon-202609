import { describe, expect, it } from "vitest";

import { MusicMetadataSpeechAudioDurationReader } from "../../../src/infrastructure/ai/music-metadata-speech-audio-duration.reader";
import {
  createMp3Audio,
  createMp4Audio,
  createWavAudio,
  createWebmAudio,
} from "../../support/audio-fixture";

const reader = new MusicMetadataSpeechAudioDurationReader();

describe("MusicMetadataSpeechAudioDurationReader", () => {
  it.each([
    ["WAV", "audio/wav", createWavAudio(60), 60],
    ["WebM", "audio/webm", createWebmAudio(60), 60],
    ["MP4", "audio/mp4", createMp4Audio(60), 60],
    ["MPEG", "audio/mpeg", createMp3Audio(1), 1.018],
  ])(
    "reads the duration from %s data",
    async (_name, mimeType, audio, expected) => {
      const duration = await reader.getDurationSeconds(
        audio as Uint8Array,
        mimeType as string,
      );

      expect(duration).toBeCloseTo(expected as number, 2);
    },
  );

  it("rejects malformed data instead of trusting the declared MIME type", async () => {
    await expect(
      reader.getDurationSeconds(Uint8Array.of(1, 2, 3), "audio/webm"),
    ).rejects.toThrow();
  });
});
