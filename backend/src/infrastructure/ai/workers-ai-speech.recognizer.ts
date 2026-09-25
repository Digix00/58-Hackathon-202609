import type { SpeechRecognizer } from "../../application/port/speech-recognizer";

const WHISPER_MODEL = "@cf/openai/whisper";
const BINARY_STRING_CHUNK_SIZE = 32 * 1024;
type WorkersAiBinding = Pick<Ai, "run">;

export class InvalidWorkersAiTranscriptionResponseError extends Error {
  constructor() {
    super("Workers AI returned an invalid transcription response");
    this.name = "InvalidWorkersAiTranscriptionResponseError";
  }
}

/** Adapts the multilingual Whisper model to the application port. */
export class WorkersAiSpeechRecognizer implements SpeechRecognizer {
  private readonly ai: WorkersAiBinding;

  constructor(ai: WorkersAiBinding) {
    this.ai = ai;
  }

  async transcribe(audio: ArrayBuffer): Promise<string> {
    if (audio.byteLength === 0) {
      throw new TypeError("audio must not be empty");
    }

    const response: unknown = await this.ai.run(
      WHISPER_MODEL,
      toBinaryString(new Uint8Array(audio)),
    );

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

function toBinaryString(audio: Uint8Array): string {
  const chunks: string[] = [];
  for (
    let offset = 0;
    offset < audio.byteLength;
    offset += BINARY_STRING_CHUNK_SIZE
  ) {
    const end = Math.min(offset + BINARY_STRING_CHUNK_SIZE, audio.byteLength);
    chunks.push(String.fromCharCode(...audio.subarray(offset, end)));
  }
  return chunks.join("");
}
