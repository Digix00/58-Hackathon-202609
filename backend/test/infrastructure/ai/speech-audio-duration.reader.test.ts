import { describe, expect, it } from "vitest";

import { SpeechAudioDurationLimitExceededError } from "../../../src/application/port/speech-audio-duration-reader";
import { MAX_MP4_SAMPLE_ENTRIES } from "../../../src/infrastructure/ai/mp4-speech-audio-duration";
import { VerifiedSpeechAudioDurationReader } from "../../../src/infrastructure/ai/speech-audio-duration.reader";
import { MAX_WAV_CHUNK_VISITS } from "../../../src/infrastructure/ai/wav-speech-audio-duration";
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

  it("skips a valid ID3v2.4 footer before parsing MPEG frames", async () => {
    const audio = createMp3Audio(1, true);

    await expect(
      reader.getDurationSeconds(audio, "audio/mpeg"),
    ).resolves.toBeCloseTo(1.018, 2);

    const mpegFrames = createMp3Audio(1);
    const footerOffset = audio.byteLength - mpegFrames.byteLength - 10;
    const truncatedFooter = audio.subarray(0, footerOffset + 5);
    await expect(
      reader.getDurationSeconds(truncatedFooter, "audio/mpeg"),
    ).rejects.toThrow("Truncated ID3 footer");

    const invalidFooter = audio.slice();
    invalidFooter[footerOffset] = 0;
    await expect(
      reader.getDurationSeconds(invalidFooter, "audio/mpeg"),
    ).rejects.toThrow("Invalid ID3 footer");
  });

  it("rejects WebM with more EBML elements than the parser budget", async () => {
    const audio = createWebmAudio(1, 1, MAX_WEBM_EBML_ELEMENT_VISITS + 1);

    await expect(
      reader.getDurationSeconds(audio, "audio/webm"),
    ).rejects.toThrow("Too many WebM EBML elements");
  });

  it.each([
    [
      "unknown-size Segment",
      createWebmAudio(1, 1, 0, undefined, { segmentSize: "unknown" }),
      1,
    ],
    [
      "unknown-size Cluster",
      createWebmAudio(0.02, 0.02, 0, undefined, { clusterSize: "unknown" }),
      0.02,
    ],
  ])(
    "accepts an eight-byte unknown-size %s",
    async (_name, audio, expected) => {
      await expect(
        reader.getDurationSeconds(audio as Uint8Array, "audio/webm"),
      ).resolves.toBeCloseTo(expected as number, 2);
    },
  );

  it("still rejects an eight-byte EBML size above the safe integer range", async () => {
    const audio = createWebmAudio(1, 1, 0, undefined, {
      segmentSize: "oversized",
    });

    await expect(
      reader.getDurationSeconds(audio, "audio/webm"),
    ).rejects.toThrow("EBML value is too large");
  });

  it("rejects MP4 sample tables over budget before handing the file to MP4Box", async () => {
    const audio = createMp4Audio(1, 1, MAX_MP4_SAMPLE_ENTRIES + 1);
    expect(audio.byteLength).toBeLessThan(10_000);

    await expect(reader.getDurationSeconds(audio, "audio/mp4")).rejects.toThrow(
      "MP4 sample count exceeds parser budget",
    );
  });

  it.each([
    "stts",
    "ctts",
    "stsc",
    "stco",
    "co64",
    "stss",
    "stps",
    "stsh",
    "stsd",
    "dref",
    "elst",
    "sbgp",
    "sgpd",
    "subs",
    "saio",
    "saiz",
    "tfra",
  ])(
    "rejects oversized MP4 %s entry counts before handing the file to MP4Box",
    async (table) => {
      const audio = createMp4Audio(1, 1, undefined, { [table]: 0xffff_ffff });
      expect(audio.byteLength).toBeLessThan(10_000);

      await expect(
        reader.getDurationSeconds(audio, "audio/mp4"),
      ).rejects.toThrow(`MP4 ${table} table exceeds parser budget`);
    },
  );

  it.each([
    "stts",
    "ctts",
    "stsc",
    "stco",
    "co64",
    "stss",
    "stps",
    "stsh",
    "stsd",
    "dref",
    "elst",
    "sbgp",
    "subs",
    "saio",
    "saiz",
    "tfra",
    "sidx",
  ])(
    "rejects a truncated MP4 %s table before handing the file to MP4Box",
    async (table) => {
      const audio = createMp4Audio(1, 1, undefined, { [table]: 2 });
      expect(audio.byteLength).toBeLessThan(10_000);

      await expect(
        reader.getDurationSeconds(audio, "audio/mp4"),
      ).rejects.toThrow(`Invalid MP4 ${table} table`);
    },
  );

  it("limits WAV chunk visits and accepts a file at the parser budget", async () => {
    const atBudget = createWavAudio(1, MAX_WAV_CHUNK_VISITS - 2);
    await expect(
      reader.getDurationSeconds(atBudget, "audio/wav"),
    ).resolves.toBeCloseTo(1, 2);

    const overBudget = createWavAudio(1, MAX_WAV_CHUNK_VISITS - 1);
    await expect(
      reader.getDurationSeconds(overBudget, "audio/wav"),
    ).rejects.toThrow("Too many WAV chunks");
  });

  it.each([
    ["single-frame", Uint8Array.of(0xf8), 0.02],
    ["two-frame CBR", Uint8Array.of(0xf9), 0.04],
  ])(
    "accepts a one-byte Opus DTX packet (%s)",
    async (_name, packet, expected) => {
      const audio = createWebmAudio(0.02, 0.02, 0, packet as Uint8Array);

      await expect(
        reader.getDurationSeconds(audio, "audio/webm"),
      ).resolves.toBeCloseTo(expected as number, 2);
    },
  );

  it.each([0xfa, 0xfb])(
    "rejects a one-byte Opus packet when frame code %s needs a second byte",
    async (toc) => {
      const audio = createWebmAudio(0.02, 0.02, 0, Uint8Array.of(toc));

      await expect(
        reader.getDurationSeconds(audio, "audio/webm"),
      ).rejects.toThrow("Truncated Opus packet");
    },
  );

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
