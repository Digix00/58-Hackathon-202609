import type { TextEmbeddingGenerator } from "../../application/port/text-embedding-generator";

const QWEN3_EMBEDDING_MODEL = "@cf/qwen/qwen3-embedding-0.6b";
const QWEN3_EMBEDDING_DIMENSIONS = 1024;

type WorkersAiBinding = Pick<Ai, "run">;

interface EmbeddingResponse {
  data: number[][];
  shape: [number, number];
}

export class InvalidWorkersAiEmbeddingResponseError extends Error {
  constructor() {
    super("Workers AI returned an invalid embedding response");
    this.name = "InvalidWorkersAiEmbeddingResponseError";
  }
}

/** Adapts Qwen3 Embedding to the application embedding port. */
export class WorkersAiTextEmbeddingGenerator implements TextEmbeddingGenerator {
  readonly modelVersion = QWEN3_EMBEDDING_MODEL;
  private readonly ai: WorkersAiBinding;

  constructor(ai: WorkersAiBinding) {
    this.ai = ai;
  }

  async generateEmbeddings(
    texts: readonly string[],
  ): Promise<readonly (readonly number[])[]> {
    if (texts.length === 0) {
      return [];
    }

    const response: unknown = await this.ai.run(QWEN3_EMBEDDING_MODEL, {
      text: [...texts],
    });

    if (
      !isEmbeddingResponse(response, texts.length, QWEN3_EMBEDDING_DIMENSIONS)
    ) {
      throw new InvalidWorkersAiEmbeddingResponseError();
    }

    return response.data;
  }
}

function isEmbeddingResponse(
  value: unknown,
  expectedCount: number,
  expectedDimensions: number,
): value is EmbeddingResponse {
  if (
    typeof value !== "object" ||
    value === null ||
    !("data" in value) ||
    !("shape" in value) ||
    !Array.isArray(value.data) ||
    !Array.isArray(value.shape) ||
    value.shape.length !== 2
  ) {
    return false;
  }

  const [count, dimensions] = value.shape;
  if (
    count !== expectedCount ||
    value.data.length !== expectedCount ||
    typeof dimensions !== "number" ||
    !Number.isInteger(dimensions) ||
    dimensions !== expectedDimensions
  ) {
    return false;
  }

  return value.data.every(
    (embedding) =>
      Array.isArray(embedding) &&
      embedding.length === dimensions &&
      embedding.every(
        (component) =>
          typeof component === "number" && Number.isFinite(component),
      ),
  );
}
