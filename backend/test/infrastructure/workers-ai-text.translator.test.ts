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
  it("translates Japanese text to English with M2M100", async () => {
    const run = vi
      .fn<Run>()
      .mockResolvedValue({ translated_text: "I am tired" });
    const translator = new WorkersAiTextTranslator(createAiBinding(run));

    await expect(
      translator.translateToEnglish("  疲れています  "),
    ).resolves.toBe("I am tired");
    expect(run).toHaveBeenCalledWith("@cf/meta/m2m100-1.2b", {
      text: "疲れています",
      source_lang: "ja",
      target_lang: "en",
    });
  });

  it("converts Japanese text to hiragana with an instruction prompt", async () => {
    const run = vi.fn<Run>().mockResolvedValue({ response: "つかれています" });
    const translator = new WorkersAiTextTranslator(createAiBinding(run));

    await expect(translator.convertToHiragana("疲れています")).resolves.toBe(
      "つかれています",
    );
    expect(run).toHaveBeenCalledWith("@cf/meta/llama-3.1-8b-instruct-fp8", {
      messages: [
        {
          role: "system",
          content:
            "Convert the user's Japanese text to hiragana. Return only the converted text, with no explanation.",
        },
        { role: "user", content: "疲れています" },
      ],
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
