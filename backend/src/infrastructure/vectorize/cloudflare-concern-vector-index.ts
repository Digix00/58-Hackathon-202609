import type {
  ConcernVectorIndex,
  ConcernVectorMatch,
} from "../../application/port/concern-vector-index";

type VectorizeBinding = Pick<Vectorize, "query" | "upsert">;

export class ConcernVectorIndexUnavailableError extends Error {
  constructor() {
    super("Cloudflare Vectorize binding is not configured");
    this.name = "ConcernVectorIndexUnavailableError";
  }
}

/** Adapts the Cloudflare Vectorize binding to the application port. */
export class CloudflareConcernVectorIndex implements ConcernVectorIndex {
  private readonly index: VectorizeBinding | undefined;

  constructor(index?: VectorizeBinding) {
    this.index = index;
  }

  async search(
    embedding: readonly number[],
    topK: number,
  ): Promise<ConcernVectorMatch[]> {
    const index = this.requireIndex();
    const result = await index.query([...embedding], {
      topK,
      returnMetadata: "all",
    });

    return result.matches.map((match) => ({
      id: match.id,
      score: match.score,
      clusterId:
        typeof match.metadata?.clusterId === "string"
          ? match.metadata.clusterId
          : null,
    }));
  }

  async upsert(input: {
    concernId: string;
    clusterId: string;
    embedding: readonly number[];
  }): Promise<void> {
    await this.requireIndex().upsert([
      {
        id: input.concernId,
        values: [...input.embedding],
        metadata: { clusterId: input.clusterId },
      },
    ]);
  }

  private requireIndex(): VectorizeBinding {
    if (!this.index) {
      throw new ConcernVectorIndexUnavailableError();
    }
    return this.index;
  }
}
