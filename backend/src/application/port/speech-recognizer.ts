export interface SpeechRecognitionOptions {
  language?: string;
}

/** Transcribes recorded audio without exposing the Workers AI binding. */
export interface SpeechRecognizer {
  transcribe(
    audio: ArrayBuffer,
    options?: SpeechRecognitionOptions,
  ): Promise<string>;
}
