import { describe, expect, it, vi } from "vitest";

import {
  InvalidWorkersAiEmbeddingResponseError,
  WorkersAiTextEmbeddingGenerator,
} from "../../src/infrastructure/ai/workers-ai-text-embedding.generator";

type Run = (model: string, inputs: { text: string[] }) => Promise<unknown>;

function createAiBinding(run: Run): Pick<Ai, "run"> {
  return { run } as unknown as Pick<Ai, "run">;
}

describe("WorkersAiTextEmbeddingGenerator", () => {
  it("sends a batch to the Japanese embedding model and preserves vectors", async () => {
    const response = {
      data: [
        [0.1, 0.2],
        [0.3, 0.4],
      ],
      shape: [2, 2],
    };
    const run = vi.fn<Run>().mockResolvedValue(response);
    const generator = new WorkersAiTextEmbeddingGenerator(createAiBinding(run));

    await expect(
      generator.generateEmbeddings(["悩みA", "悩みB"]),
    ).resolves.toEqual(response.data);
    expect(run).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledWith("@cf/pfnet/plamo-embedding-1b", {
      text: ["悩みA", "悩みB"],
    });
  });

  it("does not call Workers AI for an empty batch", async () => {
    const run = vi.fn<Run>();
    const generator = new WorkersAiTextEmbeddingGenerator(createAiBinding(run));

    await expect(generator.generateEmbeddings([])).resolves.toEqual([]);
    expect(run).not.toHaveBeenCalled();
  });

  it("rejects responses with a mismatched shape or non-finite values", async () => {
    const invalidResponses: unknown[] = [
      { data: [[0.1, 0.2]], shape: [2, 2] },
      { data: [[0.1]], shape: [1, 2] },
      { data: [[Number.NaN, 0.2]], shape: [1, 2] },
      { data: [], shape: [0, 0] },
    ];

    for (const response of invalidResponses) {
      const run = vi.fn<Run>().mockResolvedValue(response);
      const generator = new WorkersAiTextEmbeddingGenerator(
        createAiBinding(run),
      );

      await expect(
        generator.generateEmbeddings(["悩み"]),
      ).rejects.toBeInstanceOf(InvalidWorkersAiEmbeddingResponseError);
    }
  });
});
