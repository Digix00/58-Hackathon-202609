/** Transcribes recorded audio without exposing the Workers AI binding. */
export interface SpeechRecognizer {
  transcribe(audio: ArrayBuffer): Promise<string>;
}
