/**
 * Converts the original Japanese text into the representations used by the
 * application. The Application layer does not depend on a model or provider.
 */
export interface TextTranslator {
  translateToEnglish(text: string): Promise<string>;
  convertToHiragana(text: string): Promise<string>;
}
