import type { SpeechRecognizer } from "../../application/port/speech-recognizer";

/** Deterministic placeholder used to exercise the local speech API flow. */
export class LocalSpeechRecognizer implements SpeechRecognizer {
  async transcribe(audio: ArrayBuffer): Promise<string> {
    if (audio.byteLength === 0) {
      throw new TypeError("audio must not be empty");
    }
    return "[local-dev transcript]";
  }
}
