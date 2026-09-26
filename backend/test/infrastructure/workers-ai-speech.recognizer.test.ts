import { Buffer } from "node:buffer";
import { describe, expect, it, vi } from "vitest";

import {
  InvalidWorkersAiTranscriptionResponseError,
  WorkersAiSpeechRecognizer,
} from "../../src/infrastructure/ai/workers-ai-speech.recognizer";

type Run = (model: string, input: unknown) => Promise<unknown>;

function createAiBinding(run: Run): Pick<Ai, "run"> {
  return { run } as unknown as Pick<Ai, "run">;
}

describe("WorkersAiSpeechRecognizer", () => {
  it("公式仕様の Base64 入力で日本語の文字起こしを指定する", async () => {
    const bytes = new Uint8Array(10 * 1024 * 1024).fill(0xff);
    bytes[0] = 0;
    bytes[1] = 0x7f;
    bytes[32 * 1024 - 1] = 0x80;
    bytes[32 * 1024] = 0;
    const run = vi.fn<Run>().mockResolvedValue({ text: "今日は疲れました" });
    const recognizer = new WorkersAiSpeechRecognizer(createAiBinding(run));

    await expect(recognizer.transcribe(bytes.buffer)).resolves.toBe(
      "今日は疲れました",
    );
    expect(run).toHaveBeenCalledExactlyOnceWith(
      "@cf/openai/whisper-large-v3-turbo",
      { audio: expect.any(String), task: "transcribe", language: "ja" },
    );
    // binding の JSON シリアライズを経ても、上限サイズの全バイトを復元できる。
    const input = JSON.parse(JSON.stringify(run.mock.calls[0]?.[1]));
    expect(Buffer.from(input.audio, "base64").equals(Buffer.from(bytes))).toBe(
      true,
    );
  });

  it("rejects empty audio and invalid model responses", async () => {
    const run = vi.fn<Run>().mockResolvedValue({ text: 42 });
    const recognizer = new WorkersAiSpeechRecognizer(createAiBinding(run));

    await expect(recognizer.transcribe(new ArrayBuffer(0))).rejects.toThrow(
      TypeError,
    );
    await expect(
      recognizer.transcribe(new Uint8Array([1]).buffer),
    ).rejects.toBeInstanceOf(InvalidWorkersAiTranscriptionResponseError);
  });
});
