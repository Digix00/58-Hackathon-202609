import { readAscii, readUint32Le } from "./audio-binary";

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
  let blockAlign: number | undefined;
  let dataBytes = 0;

  for (let offset = 12; offset + 8 <= riffEnd; ) {
    const chunkId = readAscii(audio, offset, 4);
    const chunkLength = readUint32Le(audio, offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + chunkLength;
    if (dataEnd > riffEnd || dataEnd < dataStart) {
      throw new TypeError("Invalid WAV chunk length");
    }

    if (chunkId === "fmt ") {
      if (chunkLength < 16) {
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
      blockAlign = view.getUint16(12, true);

      if (formatCode === 0xfffe) {
        if (chunkLength < 40 || view.getUint16(16, true) < 22) {
          throw new TypeError("Invalid extensible WAV format");
        }
        formatCode = view.getUint16(24, true);
      }
    } else if (chunkId === "data") {
      dataBytes += chunkLength;
    }

    offset = dataEnd + (chunkLength % 2);
  }

  if (
    (formatCode !== 1 && formatCode !== 3) ||
    channels === undefined ||
    channels < 1 ||
    sampleRate === undefined ||
    sampleRate < 1 ||
    blockAlign === undefined ||
    blockAlign < 1 ||
    dataBytes < 1 ||
    dataBytes % blockAlign !== 0
  ) {
    throw new TypeError("WAV must contain complete PCM audio samples");
  }

  return dataBytes / blockAlign / sampleRate;
}
