export interface ConcernVectorMatch {
  id: string;
  score: number;
  clusterId: string | null;
}

/** Stores and searches concern embeddings without exposing a vendor binding. */
export interface ConcernVectorIndex {
  search(
    embedding: readonly number[],
    topK: number,
  ): Promise<ConcernVectorMatch[]>;
  upsert(input: {
    concernId: string;
    clusterId: string;
    embedding: readonly number[];
  }): Promise<void>;
}
