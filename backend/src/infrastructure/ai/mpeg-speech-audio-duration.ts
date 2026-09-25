import { readAscii } from "./audio-binary";

export function readMpegDurationSeconds(audio: Uint8Array): number {
  let offset = 0;
  if (readAscii(audio, 0, 3) === "ID3") {
    if (audio.byteLength < 10) {
      throw new TypeError("Invalid ID3 header");
    }
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
  }

  let durationSeconds = 0;
  let frameCount = 0;
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
    durationSeconds += header.samplesPerFrame / header.sampleRate;
    frameCount += 1;
    offset += header.frameLength;
  }

  if (frameCount === 0 || offset !== audio.byteLength) {
    throw new TypeError("MPEG audio contains no complete frames");
  }

  return durationSeconds;
}

type MpegFrameHeader = {
  frameLength: number;
  sampleRate: number;
  samplesPerFrame: number;
};

function readMpegFrameHeader(
  audio: Uint8Array,
  offset: number,
): MpegFrameHeader | null {
  const byte0 = audio[offset]!;
  const byte1 = audio[offset + 1]!;
  const byte2 = audio[offset + 2]!;
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

  return frameLength >= 4 ? { frameLength, sampleRate, samplesPerFrame } : null;
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
