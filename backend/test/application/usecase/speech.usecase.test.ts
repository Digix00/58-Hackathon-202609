import { describe, expect, it, vi } from "vitest";

import type { SpeechRecognizer } from "../../../src/application/port/speech-recognizer";
import {
  SpeechRecognitionUnavailableError,
  SpeechUseCase,
} from "../../../src/application/usecase/speech.usecase";

describe("SpeechUseCase", () => {
  it("transcribes audio and trims the recognition result", async () => {
    const audio = new Uint8Array([1, 2, 3]).buffer;
    const transcribe = vi.fn(
      async (_audio: ArrayBuffer) => " 今日は疲れました \n",
    );
    const recognizer: SpeechRecognizer = { transcribe };
    const useCase = new SpeechUseCase(recognizer);

    await expect(useCase.transcribe(audio)).resolves.toBe("今日は疲れました");
    expect(transcribe).toHaveBeenCalledWith(audio);
  });

  it("fails when recognition is not connected or returns no text", async () => {
    const audio = new Uint8Array([1]).buffer;
    const unavailable = new SpeechUseCase(null);
    const emptyResult = new SpeechUseCase({ transcribe: async () => "  " });

    await expect(unavailable.transcribe(audio)).rejects.toBeInstanceOf(
      SpeechRecognitionUnavailableError,
    );
    await expect(emptyResult.transcribe(audio)).rejects.toBeInstanceOf(
      SpeechRecognitionUnavailableError,
    );
  });
});
