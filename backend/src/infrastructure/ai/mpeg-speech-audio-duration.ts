import { readAscii } from "./audio-binary";

export function readMpegDurationSeconds(audio: Uint8Array): number {
  let offset = 0;
  if (readAscii(audio, 0, 3) === "ID3") {
    if (audio.byteLength < 10) {
      throw new TypeError("Invalid ID3 header");
    }
    const version = audio[3]!;
    const revision = audio[4]!;
    const flags = audio[5]!;
    const sizeBytes = audio.subarray(6, 10);
    if (sizeBytes.some((byte) => (byte & 0x80) !== 0)) {
      throw new TypeError("Invalid ID3 size");
    }
    const tagLength =
      (sizeBytes[0]! << 21) |
      (sizeBytes[1]! << 14) |
      (sizeBytes[2]! << 7) |
      sizeBytes[3]!;
    offset = 10 + tagLength;
    if (offset > audio.byteLength) {
      throw new TypeError("Truncated ID3 tag");
    }

    if ((flags & 0x10) !== 0) {
      if (version !== 4) {
        throw new TypeError("ID3 footer is only supported in ID3v2.4");
      }
      if (offset + 10 > audio.byteLength) {
        throw new TypeError("Truncated ID3 footer");
      }
      if (
        readAscii(audio, offset, 3) !== "3DI" ||
        audio[offset + 3] !== version ||
        audio[offset + 4] !== revision ||
        audio[offset + 5] !== flags ||
        !sizeBytes.every((byte, index) => audio[offset + 6 + index] === byte)
      ) {
        throw new TypeError("Invalid ID3 footer");
      }
      offset += 10;
    }
  }

  let durationSeconds = 0;
  let frameCount = 0;
  let firstFrameHeader: MpegFrameHeader | null = null;
  const firstFrameOffset = offset;
  let hasConstantFrameFormat = true;
  while (offset + 4 <= audio.byteLength) {
    if (
      readAscii(audio, offset, 3) === "TAG" &&
      offset + 128 === audio.byteLength
    ) {
      offset += 128;
      break;
    }

    const header = readMpegFrameHeader(audio, offset);
    if (!header || offset + header.frameLength > audio.byteLength) {
      throw new TypeError("Invalid or truncated MPEG audio frame");
    }
    if (!firstFrameHeader) {
      firstFrameHeader = header;
    } else if (
      firstFrameHeader.sampleRate !== header.sampleRate ||
      firstFrameHeader.samplesPerFrame !== header.samplesPerFrame
    ) {
      hasConstantFrameFormat = false;
    }
    durationSeconds += header.samplesPerFrame / header.sampleRate;
    frameCount += 1;
    offset += header.frameLength;
  }

  if (frameCount === 0 || offset !== audio.byteLength) {
    throw new TypeError("MPEG audio contains no complete frames");
  }

  const gaplessTrimSamples = firstFrameHeader
    ? readMpegGaplessTrimSamples(audio, firstFrameOffset, firstFrameHeader)
    : 0;
  if (firstFrameHeader && hasConstantFrameFormat) {
    const playbackSampleCount =
      frameCount * firstFrameHeader.samplesPerFrame - gaplessTrimSamples;
    if (playbackSampleCount <= 0) {
      throw new TypeError("Invalid MPEG encoder delay/padding");
    }
    return playbackSampleCount / firstFrameHeader.sampleRate;
  }

  const gaplessTrimSeconds =
    gaplessTrimSamples / (firstFrameHeader?.sampleRate ?? 1);
  if (gaplessTrimSeconds >= durationSeconds) {
    throw new TypeError("Invalid MPEG encoder delay/padding");
  }
  return durationSeconds - gaplessTrimSeconds;
}

function readMpegGaplessTrimSamples(
  audio: Uint8Array,
  frameOffset: number,
  header: MpegFrameHeader,
): number {
  if (header.layerNumber !== 3) {
    return 0;
  }

  const frameEnd = frameOffset + header.frameLength;
  const sideInformationLength =
    header.version === 3
      ? header.channelMode === 3
        ? 17
        : 32
      : header.channelMode === 3
        ? 9
        : 17;
  const crcLength = header.hasCrc ? 2 : 0;
  const xingOffset = frameOffset + 4 + crcLength + sideInformationLength;
  if (xingOffset + 8 > frameEnd) {
    return 0;
  }

  const xingMarker = readAscii(audio, xingOffset, 4);
  if (xingMarker !== "Xing" && xingMarker !== "Info") {
    return 0;
  }

  const flags = readUint32BigEndian(audio, xingOffset + 4);
  if (flags > 0x0f) {
    return 0;
  }
  let tagOffset = xingOffset + 8;
  for (const [flag, fieldLength] of [
    [0x01, 4], // frame count
    [0x02, 4], // byte count
    [0x04, 100], // TOC
    [0x08, 4], // quality
  ]) {
    if ((flags & flag!) !== 0) {
      tagOffset += fieldLength!;
    }
  }

  // LAME-compatible tags place the encoder delay/padding at bytes 21..23.
  if (tagOffset + 24 > frameEnd) {
    return 0;
  }
  const encoder = readAscii(audio, tagOffset, 4);
  if (encoder !== "LAME" && encoder !== "Lavf") {
    return 0;
  }

  const delayOffset = tagOffset + 21;
  const encoderDelay =
    (audio[delayOffset]! << 4) | (audio[delayOffset + 1]! >> 4);
  const encoderPadding =
    ((audio[delayOffset + 1]! & 0x0f) << 8) | audio[delayOffset + 2]!;
  // LAME reserves values above 3,000 as invalid rather than usable trim data.
  if (encoderDelay > 3_000 || encoderPadding > 3_000) {
    return 0;
  }
  return encoderDelay + encoderPadding;
}

function readUint32BigEndian(audio: Uint8Array, offset: number): number {
  return (
    audio[offset]! * 0x1_00_00_00 +
    (audio[offset + 1]! << 16) +
    (audio[offset + 2]! << 8) +
    audio[offset + 3]!
  );
}

type MpegFrameHeader = {
  frameLength: number;
  sampleRate: number;
  samplesPerFrame: number;
  version: number;
  layerNumber: number;
  channelMode: number;
  hasCrc: boolean;
};

function readMpegFrameHeader(
  audio: Uint8Array,
  offset: number,
): MpegFrameHeader | null {
  const byte0 = audio[offset]!;
  const byte1 = audio[offset + 1]!;
  const byte2 = audio[offset + 2]!;
  const byte3 = audio[offset + 3]!;
  if (byte0 !== 0xff || (byte1 & 0xe0) !== 0xe0) {
    return null;
  }

  const version = (byte1 >> 3) & 0x03;
  const layer = (byte1 >> 1) & 0x03;
  const bitrateIndex = byte2 >> 4;
  const sampleRateIndex = (byte2 >> 2) & 0x03;
  if (
    version === 1 ||
    layer === 0 ||
    bitrateIndex === 0 ||
    bitrateIndex === 15 ||
    sampleRateIndex === 3
  ) {
    return null;
  }

  const layerNumber = 4 - layer;
  const bitrateTable = getMpegBitrateTable(version, layerNumber);
  const bitrateKbps = bitrateTable[bitrateIndex - 1];
  if (bitrateKbps === undefined) {
    return null;
  }

  const baseSampleRate = [44_100, 48_000, 32_000][sampleRateIndex];
  if (baseSampleRate === undefined) {
    return null;
  }
  const sampleRate =
    version === 3
      ? baseSampleRate
      : version === 2
        ? baseSampleRate / 2
        : baseSampleRate / 4;
  const bitrate = bitrateKbps * 1_000;
  const padding = (byte2 >> 1) & 1;
  const frameLength =
    layerNumber === 1
      ? Math.floor((12 * bitrate) / sampleRate + padding) * 4
      : Math.floor(
          ((layerNumber === 3 && version !== 3 ? 72 : 144) * bitrate) /
            sampleRate,
        ) + padding;
  const samplesPerFrame =
    layerNumber === 1 ? 384 : layerNumber === 3 && version !== 3 ? 576 : 1_152;

  return frameLength >= 4
    ? {
        frameLength,
        sampleRate,
        samplesPerFrame,
        version,
        layerNumber,
        channelMode: byte3 >> 6,
        hasCrc: (byte1 & 1) === 0,
      }
    : null;
}

function getMpegBitrateTable(version: number, layer: number): number[] {
  if (version === 3) {
    switch (layer) {
      case 1:
        return [
          32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448,
        ];
      case 2:
        return [32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384];
      default:
        return [32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
    }
  }

  if (layer === 1) {
    return [32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256];
  }
  return [8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
}
