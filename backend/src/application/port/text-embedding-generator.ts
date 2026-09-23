/**
 * Generates one vector per input text, preserving the input order.
 * Application code depends on this contract instead of a Cloudflare binding.
 */
export interface TextEmbeddingGenerator {
  readonly modelVersion?: string;
  generateEmbeddings(
    texts: readonly string[],
  ): Promise<readonly (readonly number[])[]>;
}
