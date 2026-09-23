import { describe, expect, it, vi } from "vitest";

import {
  InvalidWorkersAiTextResponseError,
  WorkersAiTextTranslator,
} from "../../src/infrastructure/ai/workers-ai-text.translator";

type Run = (model: string, inputs: Record<string, unknown>) => Promise<unknown>;

function createAiBinding(run: Run): Pick<Ai, "run"> {
  return { run } as unknown as Pick<Ai, "run">;
}

describe("WorkersAiTextTranslator", () => {
  it("translates Japanese text to English with the shared model", async () => {
    const run = vi.fn<Run>().mockResolvedValue({ response: "I am tired" });
    const translator = new WorkersAiTextTranslator(createAiBinding(run));

    await expect(
      translator.translateToEnglish("  疲れています  "),
    ).resolves.toBe("I am tired");
    expect(run).toHaveBeenCalledWith("@cf/meta/llama-3.1-8b-instruct-fp8", {
      messages: [
        {
          role: "system",
          content: "Return only the requested result. Do not explain.",
        },
        {
          role: "user",
          content: "Translate Japanese to English.\n疲れています",
        },
      ],
      max_tokens: 1024,
      temperature: 0,
    });
  });

  it("converts Japanese text to hiragana with the shared model", async () => {
    const run = vi.fn<Run>().mockResolvedValue({ response: "つかれています" });
    const translator = new WorkersAiTextTranslator(createAiBinding(run));

    await expect(translator.convertToHiragana("疲れています")).resolves.toBe(
      "つかれています",
    );
    expect(run).toHaveBeenCalledWith("@cf/meta/llama-3.1-8b-instruct-fp8", {
      messages: [
        {
          role: "system",
          content: "Return only the requested result. Do not explain.",
        },
        {
          role: "user",
          content: "Convert Japanese to hiragana.\n疲れています",
        },
      ],
      max_tokens: 1024,
      temperature: 0,
    });
  });

  it("translates hiragana text to English with the same model", async () => {
    const run = vi.fn<Run>().mockResolvedValue({ response: "I am tired" });
    const translator = new WorkersAiTextTranslator(createAiBinding(run));

    await expect(
      translator.translateHiraganaToEnglish("つかれています"),
    ).resolves.toBe("I am tired");
    expect(run).toHaveBeenCalledWith("@cf/meta/llama-3.1-8b-instruct-fp8", {
      messages: [
        {
          role: "system",
          content: "Return only the requested result. Do not explain.",
        },
        {
          role: "user",
          content: "Translate hiragana Japanese to English.\nつかれています",
        },
      ],
      max_tokens: 1024,
      temperature: 0,
    });
  });

  it("rejects empty text and invalid model responses", async () => {
    const run = vi.fn<Run>().mockResolvedValue({ unexpected: true });
    const translator = new WorkersAiTextTranslator(createAiBinding(run));

    await expect(translator.translateToEnglish("  ")).rejects.toThrow(
      TypeError,
    );
    await expect(translator.convertToHiragana("悩み")).rejects.toBeInstanceOf(
      InvalidWorkersAiTextResponseError,
    );
  });
});
