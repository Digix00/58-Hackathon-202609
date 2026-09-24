export interface ConcernVectorMatch {
  id: string;
  score: number;
  clusterId: string | null;
}

/** Vector storage/search port used by concern processing. */
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
