import { describe, expect, it, vi } from "vitest";

import {
  InvalidWorkersAiTranscriptionResponseError,
  WorkersAiSpeechRecognizer,
} from "../../src/infrastructure/ai/workers-ai-speech.recognizer";

type Run = (model: string, inputs: Record<string, unknown>) => Promise<unknown>;

function createAiBinding(run: Run): Pick<Ai, "run"> {
  return { run } as unknown as Pick<Ai, "run">;
}

describe("WorkersAiSpeechRecognizer", () => {
  it("transcribes audio with the multilingual Whisper model", async () => {
    const audio = new Uint8Array([1, 2, 3]).buffer;
    const run = vi.fn<Run>().mockResolvedValue({ text: "今日は疲れました" });
    const recognizer = new WorkersAiSpeechRecognizer(createAiBinding(run));

    await expect(
      recognizer.transcribe(audio, { language: "ja" }),
    ).resolves.toBe("今日は疲れました");
    expect(run).toHaveBeenCalledWith("@cf/openai/whisper", {
      audio: [1, 2, 3],
      language: "ja",
    });
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
