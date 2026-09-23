import type { TextEmbeddingGenerator } from "../../application/port/text-embedding-generator";

const PLAMO_EMBEDDING_MODEL = "@cf/pfnet/plamo-embedding-1b";

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

/** Adapts the Japanese PLaMo model to the application embedding port. */
export class WorkersAiTextEmbeddingGenerator implements TextEmbeddingGenerator {
  constructor(private readonly ai: WorkersAiBinding) {}

  async generateEmbeddings(
    texts: readonly string[],
  ): Promise<readonly (readonly number[])[]> {
    if (texts.length === 0) {
      return [];
    }

    const response: unknown = await this.ai.run(PLAMO_EMBEDDING_MODEL, {
      text: [...texts],
    });

    if (!isEmbeddingResponse(response, texts.length)) {
      throw new InvalidWorkersAiEmbeddingResponseError();
    }

    return response.data;
  }
}

function isEmbeddingResponse(
  value: unknown,
  expectedCount: number,
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
    dimensions <= 0
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
