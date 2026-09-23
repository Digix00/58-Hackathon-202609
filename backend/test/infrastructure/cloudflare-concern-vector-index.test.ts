import { describe, expect, it, vi } from "vitest";
import {
  CloudflareConcernVectorIndex,
  ConcernVectorIndexUnavailableError,
} from "../../src/infrastructure/vectorize/cloudflare-concern-vector-index";

describe("CloudflareConcernVectorIndex", () => {
  it("queries nearest vectors and returns their cluster metadata", async () => {
    const query = vi.fn().mockResolvedValue({
      count: 1,
      matches: [
        {
          id: "concern-existing",
          score: 0.91,
          metadata: { clusterId: "cluster-1" },
        },
      ],
    });
    const index = new CloudflareConcernVectorIndex({
      query,
      upsert: vi.fn(),
    });

    await expect(index.search([0.1, 0.2], 5)).resolves.toEqual([
      { id: "concern-existing", score: 0.91, clusterId: "cluster-1" },
    ]);
    expect(query).toHaveBeenCalledWith([0.1, 0.2], {
      topK: 5,
      returnMetadata: "all",
    });
  });

  it("upserts each concern by stable ID with its cluster assignment", async () => {
    const upsert = vi.fn().mockResolvedValue({ mutationId: "mutation-1" });
    const index = new CloudflareConcernVectorIndex({ query: vi.fn(), upsert });

    await index.upsert({
      concernId: "concern-1",
      clusterId: "cluster-1",
      embedding: [0.1, 0.2],
    });

    expect(upsert).toHaveBeenCalledWith([
      {
        id: "concern-1",
        values: [0.1, 0.2],
        metadata: { clusterId: "cluster-1" },
      },
    ]);
  });

  it("fails clearly when no Vectorize binding is configured", async () => {
    const index = new CloudflareConcernVectorIndex();

    await expect(index.search([0.1], 1)).rejects.toThrow(
      ConcernVectorIndexUnavailableError,
    );
  });
});
