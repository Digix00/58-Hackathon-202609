import type { SpeechRecognizer } from "../port/speech-recognizer";

export class SpeechRecognitionUnavailableError extends Error {
  constructor() {
    super("Speech recognition is unavailable");
    this.name = "SpeechRecognitionUnavailableError";
  }
}

export interface ISpeechUseCase {
  transcribe(audio: ArrayBuffer): Promise<string>;
}

export class SpeechUseCase implements ISpeechUseCase {
  private readonly recognizer: SpeechRecognizer | null;

  constructor(recognizer: SpeechRecognizer | null) {
    this.recognizer = recognizer;
  }

  async transcribe(audio: ArrayBuffer): Promise<string> {
    if (!this.recognizer) {
      throw new SpeechRecognitionUnavailableError();
    }

    const text = (await this.recognizer.transcribe(audio)).trim();
    if (text.length === 0) {
      throw new SpeechRecognitionUnavailableError();
    }

    return text;
  }
}
