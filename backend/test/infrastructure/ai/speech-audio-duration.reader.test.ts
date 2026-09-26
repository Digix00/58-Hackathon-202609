import { describe, expect, it } from "vitest";

import { SpeechAudioDurationLimitExceededError } from "../../../src/application/port/speech-audio-duration-reader";
import {
  MAX_MP4_SAMPLE_ENTRIES,
  MAX_MP4_TABLE_ENTRIES,
  validateMp4BeforeParsing,
} from "../../../src/infrastructure/ai/mp4-speech-audio-duration";
import { VerifiedSpeechAudioDurationReader } from "../../../src/infrastructure/ai/speech-audio-duration.reader";
import { MAX_WAV_CHUNK_VISITS } from "../../../src/infrastructure/ai/wav-speech-audio-duration";
import {
  MAX_WEBM_EBML_ELEMENT_VISITS,
  MAX_WEBM_OPUS_PACKETS,
} from "../../../src/infrastructure/ai/webm-opus-speech-audio-duration";
import {
  createMp3Audio,
  createMp4Audio,
  createWavAudio,
  createWebmAudio,
} from "../../support/audio-fixture";
import {
  recordedAudio,
  replaceGaplessSamples,
} from "../../support/recorded-audio-fixture";

const reader = new VerifiedSpeechAudioDurationReader();

describe("VerifiedSpeechAudioDurationReader", () => {
  it("Chrome MediaRecorder が生成した WebM Opus を受理する", async () => {
    const duration = await reader.getDurationSeconds(
      recordedAudio("chromeWebm"),
      "audio/webm",
    );
    expect(duration).toBeGreaterThan(0);
    expect(duration).toBeLessThan(1);
  });

  it("Apple AAC の priming と padding を検証して60秒を受理する", async () => {
    await expect(
      reader.getDurationSeconds(recordedAudio("appleAac60"), "audio/mp4"),
    ).resolves.toBe(60);
  });

  it.each([
    ["実サンプル数との不一致", 2112, 976, 44100],
    ["過大な priming", 32768, 976, 2649088 - 32768 - 976],
    ["過大な padding", 2112, 4096, 2649088 - 2112 - 4096],
  ])(
    "AAC の偽装した余白情報を拒否する: %s",
    async (_name, priming, padding, samples) => {
      await expect(
        reader.getDurationSeconds(
          replaceGaplessSamples(priming, padding, samples),
          "audio/mp4",
        ),
      ).rejects.toThrow("gapless metadata");
    },
  );

  it("余白情報が整合していても60秒を超える AAC は拒否する", async () => {
    await expect(
      reader.getDurationSeconds(
        replaceGaplessSamples(0, 976, 2649088 - 976),
        "audio/mp4",
      ),
    ).rejects.toBeInstanceOf(SpeechAudioDurationLimitExceededError);
  });

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

  it("subtracts validated Xing/LAME encoder delay and padding from MP3 duration", async () => {
    const audio = createMp3Audio(60, false, {
      encoderDelaySamples: 1_105,
      encoderPaddingSamples: 191,
    });

    await expect(
      reader.getDurationSeconds(audio, "audio/mpeg"),
    ).resolves.toBeCloseTo(60, 6);
  });

  it.each([
    ["an unrecognized encoder marker", { encoderTag: "FAKE3.100" }],
    ["an out-of-range encoder delay", { encoderDelaySamples: 3_001 }],
  ])("ignores %s when calculating MP3 duration", async (_name, metadata) => {
    const audio = createMp3Audio(60, false, {
      encoderDelaySamples: 1_105,
      encoderPaddingSamples: 191,
      ...metadata,
    });

    await expect(
      reader.getDurationSeconds(audio, "audio/mpeg"),
    ).rejects.toBeInstanceOf(SpeechAudioDurationLimitExceededError);
  });

  it("stops parsing MPEG frames once audio exceeds the maximum gapless trim", async () => {
    const audio = createMp3Audio(61);
    audio[audio.byteLength - 417] = 0;

    await expect(
      reader.getDurationSeconds(audio, "audio/mpeg"),
    ).rejects.toBeInstanceOf(SpeechAudioDurationLimitExceededError);
  });

  it("accepts a complete nonzero Opus channel mapping table", async () => {
    const audio = createWebmAudio(1, 1, 0, undefined, {
      opusHead: createOpusHead(2, 1, [1, 1, 0, 1]),
    });

    await expect(
      reader.getDurationSeconds(audio, "audio/webm"),
    ).resolves.toBeCloseTo(1, 2);
  });

  it.each([
    ["three-channel family 0", createOpusHead(3, 0)],
    ["a family 1 header without its channel map", createOpusHead(2, 1, [1, 1])],
    [
      "a family 1 map with an out-of-range channel",
      createOpusHead(2, 1, [1, 1, 0, 2]),
    ],
    ["a family 1 map with no streams", createOpusHead(2, 1, [0, 0, 0, 1])],
  ])("rejects %s", async (_name, opusHead) => {
    const audio = createWebmAudio(1, 1, 0, undefined, { opusHead });

    await expect(
      reader.getDurationSeconds(audio, "audio/webm"),
    ).rejects.toThrow("Invalid WebM Opus channel mapping");
  });

  it("rejects WebM with more EBML elements than the parser budget", async () => {
    const audio = createWebmAudio(1, 1, MAX_WEBM_EBML_ELEMENT_VISITS + 1);

    await expect(
      reader.getDurationSeconds(audio, "audio/webm"),
    ).rejects.toThrow("Too many WebM EBML elements");
  });

  it("caps fixed-laced Opus packet processing", async () => {
    const audio = createWebmAudio(
      (MAX_WEBM_OPUS_PACKETS + 1) * 0.02,
      1,
      0,
      Uint8Array.of(0x80),
      {
        fixedLacingPacketsPerBlock: 256,
      },
    );

    await expect(
      reader.getDurationSeconds(audio, "audio/webm"),
    ).rejects.toBeInstanceOf(SpeechAudioDurationLimitExceededError);
  });

  it("rejects a WebM CodecDelay that does not match OpusHead pre-skip", async () => {
    const audio = createWebmAudio(1, 1, 0, undefined, {
      codecDelayNs: 10_000_000_000,
    });

    await expect(
      reader.getDurationSeconds(audio, "audio/webm"),
    ).rejects.toThrow("WebM Opus CodecDelay does not match OpusHead pre-skip");
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

  it("rejects MP4 audio that switches between sample descriptions", async () => {
    const audio = createMp4Audio(1, 1, undefined, {}, undefined, 2, 2);

    await expect(reader.getDurationSeconds(audio, "audio/mp4")).rejects.toThrow(
      "MP4 audio track must contain exactly one sample description",
    );
  });

  it.each([
    [
      "version 1 fixed-length entries",
      {
        version: 1,
        defaultLength: 2,
        entryCount: 1,
        entryData: Uint8Array.of(0, 1),
      },
    ],
    [
      "version 2 fixed-length entries",
      {
        version: 2,
        defaultLength: 2,
        defaultSampleDescriptionIndex: 0,
        entryCount: 1,
        entryData: Uint8Array.of(0, 1),
      },
    ],
    [
      "version 2 per-entry lengths",
      {
        version: 2,
        defaultLength: 0,
        defaultSampleDescriptionIndex: 0,
        entryCount: 2,
        entryData: Uint8Array.of(0, 0, 0, 2, 0, 1, 0, 0, 0, 2, 0, 2),
      },
    ],
  ] as const)(
    "accepts valid MP4 sgpd %s during preflight",
    async (_name, sgpd) => {
      const audio = createMp4Audio(1, 1, undefined, {}, sgpd);

      expect(() => validateMp4BeforeParsing(audio)).not.toThrow();
    },
  );

  it.each([
    [
      "version 2 actual entry_count over budget with a zero default index",
      {
        version: 2,
        defaultLength: 0,
        defaultSampleDescriptionIndex: 0,
        entryCount: MAX_MP4_TABLE_ENTRIES + 1,
        entryData: new Uint8Array(),
      },
      "MP4 sgpd table exceeds parser budget",
    ],
    [
      "version 2 default index beyond entry_count",
      {
        version: 2,
        defaultLength: 2,
        defaultSampleDescriptionIndex: 2,
        entryCount: 1,
        entryData: Uint8Array.of(0, 1),
      },
      "Invalid MP4 sgpd table",
    ],
    [
      "version 2 fixed-length records shorter than entry_count",
      {
        version: 2,
        defaultLength: 2,
        defaultSampleDescriptionIndex: 0,
        entryCount: 2,
        entryData: Uint8Array.of(0, 1),
      },
      "Invalid MP4 sgpd table",
    ],
    [
      "version 2 truncated per-entry description length",
      {
        version: 2,
        defaultLength: 0,
        defaultSampleDescriptionIndex: 0,
        entryCount: 1,
        entryData: Uint8Array.of(0, 0, 0, 2, 0),
      },
      "Invalid MP4 sgpd table",
    ],
    [
      "version 2 per-entry length extending past the box",
      {
        version: 2,
        defaultLength: 0,
        defaultSampleDescriptionIndex: 0,
        entryCount: 1,
        entryData: Uint8Array.of(0, 0, 0, 3, 0, 1),
      },
      "Invalid MP4 sgpd table",
    ],
    [
      "version 2 trailing bytes after the declared entries",
      {
        version: 2,
        defaultLength: 2,
        defaultSampleDescriptionIndex: 0,
        entryCount: 1,
        entryData: Uint8Array.of(0, 1, 2),
      },
      "Invalid MP4 sgpd table",
    ],
  ] as const)(
    "rejects malformed MP4 sgpd %s before MP4Box",
    async (_name, sgpd, error) => {
      const audio = createMp4Audio(1, 1, undefined, {}, sgpd);
      expect(audio.byteLength).toBeLessThan(10_000);

      await expect(
        reader.getDurationSeconds(audio, "audio/mp4"),
      ).rejects.toThrow(error);
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

  it("counts each code 3 frame when deriving WebM duration", async () => {
    // 763 packets with four 20 ms frames each contain over 60 seconds of
    // audio, while their timestamps and declared duration are under 16s.
    const audio = createWebmAudio(
      15.26,
      1,
      0,
      Uint8Array.of(0xfb, 4, 0, 0, 0, 0),
    );

    await expect(
      reader.getDurationSeconds(audio, "audio/webm"),
    ).rejects.toBeInstanceOf(SpeechAudioDurationLimitExceededError);
  });

  it.each([
    ["code 0 DTX", Uint8Array.of(0xf8), 0.02],
    ["code 1 equal frames", opusPacket([0xf9], 2), 0.04],
    ["code 1 maximum-size frames", opusPacket([0xf9], 2_550), 0.04],
    ["code 2 variable frames", Uint8Array.of(0xfa, 1, 0, 0), 0.04],
    ["code 2 extended frame length", opusPacket([0xfa, 0xfc, 0], 254), 0.04],
    ["code 3 CBR frames", Uint8Array.of(0xfb, 2, 0, 0), 0.04],
    ["code 3 VBR frames", Uint8Array.of(0xfb, 0x82, 1, 0, 0), 0.04],
    ["code 3 CBR with padding", Uint8Array.of(0xfb, 0x42, 1, 0, 0, 0xff), 0.04],
    ["code 3 VBR with padding", Uint8Array.of(0xfb, 0xc2, 1, 1, 0, 0, 0), 0.04],
    [
      "code 3 continued padding length",
      opusPacket([0xfb, 0x42, 0xff, 0], 256),
      0.04,
    ],
    ["code 3 maximum-size frame", opusPacket([0xfb, 1], 1_275), 0.02],
    ["code 3 four 20 ms frames", Uint8Array.of(0xfb, 4, 0, 0, 0, 0), 0.08],
  ])(
    "accepts a well-formed %s Opus packet",
    async (_name, packet, expected) => {
      const audio = createWebmAudio(0.02, 0.02, 0, packet as Uint8Array);

      await expect(
        reader.getDurationSeconds(audio, "audio/webm"),
      ).resolves.toBeCloseTo(expected as number, 2);
    },
  );

  it.each([
    ["code 0 frame over 1,275 bytes", opusPacket([0xf8], 1_276)],
    ["code 1 odd payload", opusPacket([0xf9], 1)],
    ["code 1 frames over 1,275 bytes", opusPacket([0xf9], 2_552)],
    ["code 2 frame length beyond payload", Uint8Array.of(0xfa, 2, 0)],
    ["code 2 second frame over 1,275 bytes", opusPacket([0xfa, 0], 1_276)],
    ["truncated code 2 extended length", Uint8Array.of(0xfa, 0xfc)],
    ["code 3 with no frames", Uint8Array.of(0xfb, 0)],
    ["code 3 with more than 48 frames", Uint8Array.of(0xfb, 49)],
    ["code 3 over 120 ms", opusPacket([0xfb, 7], 7)],
    [
      "code 3 CBR payload not divisible by frame count",
      opusPacket([0xfb, 2], 1),
    ],
    ["code 3 CBR frame over 1,275 bytes", opusPacket([0xfb, 1], 1_276)],
    ["code 3 VBR length beyond payload", Uint8Array.of(0xfb, 0x82, 2, 0)],
    [
      "code 3 final VBR frame over 1,275 bytes",
      opusPacket([0xfb, 0x82, 1, 0], 1_276),
    ],
    ["code 3 padding beyond packet", Uint8Array.of(0xfb, 0x42, 3)],
    ["code 3 unterminated padding length", Uint8Array.of(0xfb, 0x42, 0xff)],
  ])("rejects a malformed %s Opus packet", async (_name, packet) => {
    const audio = createWebmAudio(0.02, 0.02, 0, packet as Uint8Array);

    await expect(
      reader.getDurationSeconds(audio, "audio/webm"),
    ).rejects.toThrow();
  });

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

  it("uses a verified MP4 edit list to measure trimmed playback duration", async () => {
    const audio = createMp4Audio(60, 60, undefined, {}, undefined, 1, 1, [
      { segmentDurationSeconds: 60, mediaTimeSeconds: 0 },
    ]);

    await expect(reader.getDurationSeconds(audio, "audio/mp4")).resolves.toBe(
      60,
    );
  });

  it("accepts a 127-byte first packet in EBML lacing", async () => {
    const packet = new Uint8Array(127);
    packet[0] = 0xf8;
    const audio = createWebmAudio(0.04, 0.04, 0, packet, {
      ebmlLacingPacketsPerBlock: 2,
    });

    await expect(
      reader.getDurationSeconds(audio, "audio/webm"),
    ).resolves.toBeCloseTo(0.04, 2);
  });

  it("rejects an MP4 edit list that points beyond verified audio samples", async () => {
    const audio = createMp4Audio(60, 60, undefined, {}, undefined, 1, 1, [
      { segmentDurationSeconds: 60, mediaTimeSeconds: 2 },
    ]);

    await expect(reader.getDurationSeconds(audio, "audio/mp4")).rejects.toThrow(
      "MP4 edit list exceeds the verified audio samples",
    );
  });

  it("rejects edited MP4 when AAC sample durations disagree with access units", async () => {
    const audio = createMp4Audio(
      70,
      70,
      undefined,
      {},
      undefined,
      1,
      1,
      [{ segmentDurationSeconds: 60, mediaTimeSeconds: 0 }],
      878,
    );

    await expect(reader.getDurationSeconds(audio, "audio/mp4")).rejects.toThrow(
      "MP4 sample duration does not match AAC configuration",
    );
  });

  it("rejects a WebM Opus stream as soon as its verified duration exceeds 60 seconds", async () => {
    await expect(
      reader.getDurationSeconds(createWebmAudio(61, 1), "audio/webm"),
    ).rejects.toBeInstanceOf(SpeechAudioDurationLimitExceededError);
  });

  it.each([
    ["CodecDelay", 60.01, { codecDelayNs: 20_000_000 }],
    ["positive DiscardPadding", 60.01, { discardPaddingNs: 20_000_000 }],
    ["negative DiscardPadding", 60.01, { discardPaddingNs: -20_000_000 }],
  ])(
    "subtracts %s when calculating WebM playback duration",
    async (_name, encodedDuration, options) => {
      const audio = createWebmAudio(
        encodedDuration as number,
        1,
        0,
        Uint8Array.of(0xf8, 0xff),
        options as { codecDelayNs?: number; discardPaddingNs?: number },
      );

      await expect(
        reader.getDurationSeconds(audio, "audio/webm"),
      ).resolves.toBeCloseTo(60, 2);
    },
  );

  it("rejects WebM DiscardPadding longer than its encoded audio block", async () => {
    const audio = createWebmAudio(0.02, 0.02, 0, Uint8Array.of(0xf8, 0xff), {
      discardPaddingNs: 20_000_001,
    });

    await expect(
      reader.getDurationSeconds(audio, "audio/webm"),
    ).rejects.toThrow("WebM discard padding exceeds its audio block");
  });

  it("keeps the timestamp span across intermediate WebM DiscardPadding", async () => {
    const audio = createWebmAudio(70, 70, 0, undefined, {
      discardPaddingNs: 20_000_000,
      discardPaddingAtPackets: Array.from(
        { length: 500 },
        (_, index) => index + 500,
      ),
    });

    await expect(
      reader.getDurationSeconds(audio, "audio/webm"),
    ).rejects.toBeInstanceOf(SpeechAudioDurationLimitExceededError);
  });

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

function opusPacket(header: number[], payloadLength: number): Uint8Array {
  const packet = new Uint8Array(header.length + payloadLength);
  packet.set(header);
  return packet;
}

function createOpusHead(
  channels: number,
  mappingFamily: number,
  mappingTable: number[] = [],
): Uint8Array {
  return Uint8Array.from([
    ...Array.from("OpusHead", (character) => character.charCodeAt(0)),
    1,
    channels,
    0,
    0,
    0x80,
    0xbb,
    0,
    0,
    0,
    0,
    mappingFamily,
    ...mappingTable,
  ]);
}
