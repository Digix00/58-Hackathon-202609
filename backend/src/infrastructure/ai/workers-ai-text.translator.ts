import type { TextTranslator } from "../../application/port/text-translator";

const TRANSLATION_MODEL = "@cf/meta/m2m100-1.2b";
const HIRAGANA_MODEL = "@cf/meta/llama-3.1-8b-instruct-fp8";

type WorkersAiBinding = Pick<Ai, "run">;

export class InvalidWorkersAiTextResponseError extends Error {
  constructor() {
    super("Workers AI returned an invalid text response");
    this.name = "InvalidWorkersAiTextResponseError";
  }
}

/**
 * Adapts Workers AI to the two text representations required by the app.
 * English uses the dedicated M2M100 translation model. Hiragana conversion
 * uses an instruction model so the provider-specific prompt stays here.
 */
export class WorkersAiTextTranslator implements TextTranslator {
  constructor(private readonly ai: WorkersAiBinding) {}

  async translateToEnglish(text: string): Promise<string> {
    const response: unknown = await this.ai.run(TRANSLATION_MODEL, {
      text: requireText(text),
      source_lang: "ja",
      target_lang: "en",
    });

    return extractText(response);
  }

  async convertToHiragana(text: string): Promise<string> {
    const response: unknown = await this.ai.run(HIRAGANA_MODEL, {
      messages: [
        {
          role: "system",
          content:
            "Convert the user's Japanese text to hiragana. Return only the converted text, with no explanation.",
        },
        { role: "user", content: requireText(text) },
      ],
    });

    return extractText(response);
  }
}

function requireText(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    throw new TypeError("text must be a non-empty string");
  }
  return trimmed;
}

function extractText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value !== "object" || value === null) {
    throw new InvalidWorkersAiTextResponseError();
  }

  for (const key of ["translated_text", "response", "text"]) {
    const candidate = Reflect.get(value, key);
    if (typeof candidate === "string") {
      return candidate;
    }
  }

  throw new InvalidWorkersAiTextResponseError();
}
