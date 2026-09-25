import { parseBuffer } from "music-metadata";

import type { SpeechAudioDurationReader } from "../../application/port/speech-audio-duration-reader";

/** Reads container duration for the audio formats accepted by the speech API. */
export class MusicMetadataSpeechAudioDurationReader
  implements SpeechAudioDurationReader
{
  async getDurationSeconds(
    audio: Uint8Array,
    mimeType: string,
  ): Promise<number> {
    const metadata = await parseBuffer(
      audio,
      { mimeType, size: audio.byteLength },
      { duration: true, skipCovers: true },
    );
    const duration = metadata.format.duration;
    if (
      metadata.format.hasAudio !== true ||
      duration === undefined ||
      !Number.isFinite(duration)
    ) {
      throw new TypeError("Audio duration could not be determined");
    }

    return duration;
  }
}
