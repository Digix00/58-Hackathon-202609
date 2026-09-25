/** Reads the encoded audio duration without decoding or persisting the audio. */
export interface SpeechAudioDurationReader {
  getDurationSeconds(audio: Uint8Array, mimeType: string): Promise<number>;
}
