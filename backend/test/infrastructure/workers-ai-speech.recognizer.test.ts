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
  it("passes byte-preserving binary input without building a number array", async () => {
    const bytes = new Uint8Array(32 * 1024 + 1).fill(0xff);
    bytes[0] = 0;
    bytes[1] = 0x7f;
    bytes[32 * 1024 - 1] = 0x80;
    bytes[32 * 1024] = 0;
    const run = vi.fn<Run>().mockResolvedValue({ text: "今日は疲れました" });
    const recognizer = new WorkersAiSpeechRecognizer(createAiBinding(run));

    await expect(recognizer.transcribe(bytes.buffer)).resolves.toBe(
      "今日は疲れました",
    );
    const binaryInput = run.mock.calls[0]?.[1];
    expect(binaryInput).toBe(`\x00\x7f${"\xff".repeat(32 * 1024 - 3)}\x80\x00`);
    expect(typeof binaryInput).toBe("string");
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
