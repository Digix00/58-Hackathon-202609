import type { SpeechRecognizer } from "../../application/port/speech-recognizer";

const WHISPER_MODEL = "@cf/openai/whisper";

type WorkersAiBinding = Pick<Ai, "run">;
type WorkersAiRun = (
  model: string,
  input: Record<string, unknown>,
) => Promise<unknown>;

export class InvalidWorkersAiTranscriptionResponseError extends Error {
  constructor() {
    super("Workers AI returned an invalid transcription response");
    this.name = "InvalidWorkersAiTranscriptionResponseError";
  }
}

/** Adapts the multilingual Whisper model to the application port. */
export class WorkersAiSpeechRecognizer implements SpeechRecognizer {
  constructor(private readonly ai: WorkersAiBinding) {}

  async transcribe(audio: ArrayBuffer): Promise<string> {
    if (audio.byteLength === 0) {
      throw new TypeError("audio must not be empty");
    }

    const run = this.ai.run as unknown as WorkersAiRun;
    const audioBytes = Array.from(new Uint8Array(audio));
    const response: unknown = await run(WHISPER_MODEL, {
      audio: audioBytes,
    });

    if (
      typeof response !== "object" ||
      response === null ||
      typeof Reflect.get(response, "text") !== "string"
    ) {
      throw new InvalidWorkersAiTranscriptionResponseError();
    }

    return Reflect.get(response, "text");
  }
}
