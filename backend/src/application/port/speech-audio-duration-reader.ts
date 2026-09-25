/** Reads the encoded audio duration without decoding or persisting the audio. */
export interface SpeechAudioDurationReader {
  getDurationSeconds(audio: Uint8Array, mimeType: string): Promise<number>;
}

/** Indicates that verified audio samples exceed the supported duration. */
export class SpeechAudioDurationLimitExceededError extends Error {
  constructor() {
    super("Speech audio exceeds the supported duration");
    this.name = "SpeechAudioDurationLimitExceededError";
  }
}
