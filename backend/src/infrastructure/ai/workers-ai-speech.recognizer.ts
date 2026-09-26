import type { SpeechRecognizer } from "../../application/port/speech-recognizer";

const WHISPER_MODEL = "@cf/openai/whisper-large-v3-turbo";
type WorkersAiBinding = Pick<Ai, "run">;

export class InvalidWorkersAiTranscriptionResponseError extends Error {
  constructor() {
    super("Workers AI returned an invalid transcription response");
    this.name = "InvalidWorkersAiTranscriptionResponseError";
  }
}

/** 日本語の文字起こしを Workers AI の公開入力仕様へ変換する。 */
export class WorkersAiSpeechRecognizer implements SpeechRecognizer {
  private readonly ai: WorkersAiBinding;

  constructor(ai: WorkersAiBinding) {
    this.ai = ai;
  }

  async transcribe(audio: ArrayBuffer): Promise<string> {
    if (audio.byteLength === 0) {
      throw new TypeError("audio must not be empty");
    }

    // binary string は binding 内で JSON 化される。対応する Base64 入力を使い、
    // 10 MiB の音声を巨大な number[] に展開せず、日本語の文字起こしを指定する。
    const response: unknown = await this.ai.run(WHISPER_MODEL, {
      audio: toBase64(new Uint8Array(audio)),
      task: "transcribe",
      language: "ja",
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

function toBase64(audio: Uint8Array): string {
  // 3の倍数で区切り、中間チャンクにBase64のpaddingを入れない。
  const chunkSize = 3 * 8192;
  const chunks: string[] = [];
  for (let offset = 0; offset < audio.byteLength; offset += chunkSize) {
    chunks.push(
      btoa(String.fromCharCode(...audio.subarray(offset, offset + chunkSize))),
    );
  }
  return chunks.join("");
}
