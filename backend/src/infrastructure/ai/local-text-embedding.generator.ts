import type { TextEmbeddingGenerator } from "../../application/port/text-embedding-generator";

const LOCAL_EMBEDDING_DIMENSIONS = 1024;

/**
 * Stands in for WorkersAiTextEmbeddingGenerator when no AI binding is
 * available (local `wrangler dev`, see wrangler.dev.jsonc). Derives a
 * deterministic 1024-dimensional vector from each text's hash so the same
 * input always produces the same output, without calling Workers AI. The
 * values are only for exercising the development Vectorize integration and
 * have no relation to the production model's embeddings.
 */
export class LocalTextEmbeddingGenerator implements TextEmbeddingGenerator {
  readonly modelVersion = "local-deterministic-1024-v1";

  generateEmbeddings(
    texts: readonly string[],
  ): Promise<readonly (readonly number[])[]> {
    return Promise.resolve(texts.map(toDeterministicEmbedding));
  }
}

function toDeterministicEmbedding(text: string): readonly number[] {
  const seed = hashText(text);
  const embedding: number[] = [];
  let state = seed;

  for (let i = 0; i < LOCAL_EMBEDDING_DIMENSIONS; i++) {
    state = nextRandom(state);
    embedding.push((state / 0xffffffff) * 2 - 1);
  }

  return embedding;
}

function hashText(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function nextRandom(state: number): number {
  let x = state;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return x >>> 0;
}
