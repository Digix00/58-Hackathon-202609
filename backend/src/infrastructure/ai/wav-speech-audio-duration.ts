import { readAscii, readUint32Le } from "./audio-binary";

export const MAX_WAV_CHUNK_VISITS = 100_000;

const PCM_SUBFORMAT_GUID = Uint8Array.of(
  1,
  0,
  0,
  0,
  0,
  0,
  16,
  0,
  128,
  0,
  0,
  170,
  0,
  56,
  155,
  113,
);
const IEEE_FLOAT_SUBFORMAT_GUID = Uint8Array.of(
  3,
  0,
  0,
  0,
  0,
  0,
  16,
  0,
  128,
  0,
  0,
  170,
  0,
  56,
  155,
  113,
);

export function readWavDurationSeconds(audio: Uint8Array): number {
  if (
    audio.byteLength < 12 ||
    readAscii(audio, 0, 4) !== "RIFF" ||
    readAscii(audio, 8, 4) !== "WAVE"
  ) {
    throw new TypeError("Invalid WAV header");
  }

  const riffEnd = 8 + readUint32Le(audio, 4);
  if (riffEnd > audio.byteLength || riffEnd < 12) {
    throw new TypeError("Invalid WAV length");
  }

  let formatCode: number | undefined;
  let channels: number | undefined;
  let sampleRate: number | undefined;
  let byteRate: number | undefined;
  let blockAlign: number | undefined;
  let bitsPerSample: number | undefined;
  let dataBytes = 0;
  let chunksVisited = 0;

  for (let offset = 12; offset + 8 <= riffEnd; ) {
    chunksVisited += 1;
    if (chunksVisited > MAX_WAV_CHUNK_VISITS) {
      throw new TypeError("Too many WAV chunks");
    }
    const chunkId = readAscii(audio, offset, 4);
    const chunkLength = readUint32Le(audio, offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + chunkLength;
    if (dataEnd > riffEnd || dataEnd < dataStart) {
      throw new TypeError("Invalid WAV chunk length");
    }

    if (chunkId === "fmt ") {
      if (chunkLength < 16 || formatCode !== undefined) {
        throw new TypeError("Invalid WAV format chunk");
      }
      const view = new DataView(
        audio.buffer,
        audio.byteOffset + dataStart,
        chunkLength,
      );
      formatCode = view.getUint16(0, true);
      channels = view.getUint16(2, true);
      sampleRate = view.getUint32(4, true);
      byteRate = view.getUint32(8, true);
      blockAlign = view.getUint16(12, true);
      bitsPerSample = view.getUint16(14, true);

      if (formatCode === 0xfffe) {
        if (chunkLength < 40 || view.getUint16(16, true) < 22) {
          throw new TypeError("Invalid extensible WAV format");
        }
        const validBitsPerSample = view.getUint16(18, true);
        const extensibleFormatCode = getExtensibleFormatCode(view);
        if (
          validBitsPerSample < 1 ||
          validBitsPerSample > bitsPerSample ||
          extensibleFormatCode === undefined
        ) {
          throw new TypeError("Invalid extensible WAV sample format");
        }
        formatCode = extensibleFormatCode;
      }
    } else if (chunkId === "data") {
      dataBytes += chunkLength;
    }

    offset = dataEnd + (chunkLength % 2);
  }

  const supportedBitDepth =
    (formatCode === 1 && [8, 16, 24, 32].includes(bitsPerSample ?? 0)) ||
    (formatCode === 3 && [32, 64].includes(bitsPerSample ?? 0));
  if (
    !supportedBitDepth ||
    channels === undefined ||
    channels < 1 ||
    sampleRate === undefined ||
    sampleRate < 1 ||
    byteRate === undefined ||
    blockAlign === undefined ||
    blockAlign < 1 ||
    bitsPerSample === undefined ||
    dataBytes < 1 ||
    dataBytes % blockAlign !== 0
  ) {
    throw new TypeError("WAV must contain complete PCM audio samples");
  }

  const bytesPerSample = bitsPerSample / 8;
  if (
    blockAlign !== channels * bytesPerSample ||
    byteRate !== sampleRate * blockAlign
  ) {
    throw new TypeError("WAV sample format fields are inconsistent");
  }

  return dataBytes / blockAlign / sampleRate;
}

function getExtensibleFormatCode(view: DataView): 1 | 3 | undefined {
  const subformat = new Uint8Array(view.buffer, view.byteOffset + 24, 16);
  let formatCode: 1 | 3 | undefined;
  let expected: Uint8Array;
  if (subformat[0] === 1) {
    formatCode = 1;
    expected = PCM_SUBFORMAT_GUID;
  } else if (subformat[0] === 3) {
    formatCode = 3;
    expected = IEEE_FLOAT_SUBFORMAT_GUID;
  } else {
    return undefined;
  }
  return expected.every((byte, index) => subformat[index] === byte)
    ? formatCode
    : undefined;
}
