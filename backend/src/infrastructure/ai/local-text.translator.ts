import type { TextTranslator } from "../../application/port/text-translator";

/**
 * Stands in for WorkersAiTextTranslator when no AI binding is available
 * (local `wrangler dev`, see wrangler.dev.jsonc). Produces a deterministic,
 * clearly-fake result so the pipeline can run end-to-end without Cloudflare
 * authentication.
 */
export class LocalTextTranslator implements TextTranslator {
  readonly translateToEnglish = (text: string): Promise<string> =>
    Promise.resolve(`[local-dev en] ${text}`);

  readonly convertToHiragana = (text: string): Promise<string> =>
    Promise.resolve(`[local-dev hira] ${text}`);
}
