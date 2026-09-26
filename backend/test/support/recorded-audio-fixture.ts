import { Buffer } from "node:buffer";
import { gunzipSync } from "node:zlib";
import recordings from "./recorded-audio.json";

// 個人の録音は含まない。合成音を実エンコーダーで符号化した gzip/Base64 データ。
// chromeWebm: Chrome MediaRecorder(audio/webm;codecs=opus)、440 Hz、約0.5秒。
// appleAac60: 44.1 kHz/16-bit/mono の60秒の無音WAVを
// afconvert -f m4af -d 'aac ' input.wav output.m4a で変換。
export function recordedAudio(
  name: keyof typeof recordings,
): Uint8Array<ArrayBuffer> {
  return new Uint8Array(gunzipSync(Buffer.from(recordings[name], "base64")));
}

export function replaceGaplessSamples(
  priming: number,
  padding: number,
  samples: number,
) {
  const audio = recordedAudio("appleAac60");
  const original = "00000000 00000840 000003D0 0000000000285FF0";
  const offset = Buffer.from(audio).indexOf(original);
  if (offset < 0) throw new Error("Fixture has no gapless metadata");
  const hex = (value: number, length: number) =>
    value.toString(16).padStart(length, "0");
  audio.set(
    new TextEncoder().encode(
      `00000000 ${hex(priming, 8)} ${hex(padding, 8)} ${hex(samples, 16)}`,
    ),
    offset,
  );
  return audio;
}
