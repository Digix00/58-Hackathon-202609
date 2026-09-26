import type { SpeechAudioDurationReader } from "../../application/port/speech-audio-duration-reader";
import { readMp4DurationSeconds } from "./mp4-speech-audio-duration";
import { readMpegDurationSeconds } from "./mpeg-speech-audio-duration";
import { readWavDurationSeconds } from "./wav-speech-audio-duration";
import { readWebmOpusDurationSeconds } from "./webm-opus-speech-audio-duration";

/** Derives duration from audio samples/frames instead of container duration tags. */
export class VerifiedSpeechAudioDurationReader
  implements SpeechAudioDurationReader
{
  async getDurationSeconds(
    audio: Uint8Array,
    mimeType: string,
  ): Promise<number> {
    switch (mimeType) {
      case "audio/wav":
        return readWavDurationSeconds(audio);
      case "audio/mpeg":
        return readMpegDurationSeconds(audio);
      case "audio/mp4":
        return readMp4DurationSeconds(audio);
      case "audio/webm":
        return readWebmOpusDurationSeconds(audio);
      default:
        throw new TypeError("Unsupported audio type");
    }
  }
}
