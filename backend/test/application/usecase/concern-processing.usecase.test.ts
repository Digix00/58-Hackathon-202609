import { describe, expect, it, vi } from "vitest";

import {
  CONCERN_PROCESSING_MESSAGE_TYPE,
  type ConcernProcessingMessage,
} from "../../../src/application/port/concern-processing-queue";
import type { ConcernVectorIndex } from "../../../src/application/port/concern-vector-index";
import type { TextEmbeddingGenerator } from "../../../src/application/port/text-embedding-generator";
import type { TextTranslator } from "../../../src/application/port/text-translator";
import type { ConcernProcessingRepository } from "../../../src/application/repository/concern-processing.repository";
import { ConcernProcessingUseCase } from "../../../src/application/usecase/concern-processing.usecase";

const message: ConcernProcessingMessage = {
  type: CONCERN_PROCESSING_MESSAGE_TYPE,
  concernId: "concern-1",
  body: "  疲れています  ",
};

function createDependencies(input?: {
  status?: "pending" | "processing" | "ready" | "failed";
  clusterId?: string | null;
  matches?: Awaited<ReturnType<ConcernVectorIndex["search"]>>;
}) {
  const translator: TextTranslator = {
    convertToHiragana: vi.fn().mockResolvedValue("つかれています"),
    translateToEnglish: vi.fn().mockResolvedValue("I am tired"),
  };
  const embeddingGenerator: TextEmbeddingGenerator = {
    generateEmbeddings: vi.fn().mockResolvedValue([[0.1, 0.2]]),
  };
  const vectorIndex: ConcernVectorIndex = {
    search: vi.fn().mockResolvedValue(input?.matches ?? []),
    upsert: vi.fn().mockResolvedValue(undefined),
  };
  const repository: ConcernProcessingRepository = {
    findState: vi.fn().mockResolvedValue(
      input?.status === "ready"
        ? { status: "ready", clusterId: input.clusterId ?? "cluster-1" }
        : {
            status: input?.status ?? "pending",
            clusterId: input?.clusterId ?? null,
          },
    ),
    markProcessing: vi.fn().mockResolvedValue(undefined),
    assignCluster: vi
      .fn()
      .mockImplementation(async (_concernId, clusterId) => clusterId),
    saveResult: vi.fn().mockResolvedValue(undefined),
    markFailed: vi.fn().mockResolvedValue(undefined),
  };
  const useCase = new ConcernProcessingUseCase(
    translator,
    embeddingGenerator,
    vectorIndex,
    repository,
    {
      similarityThreshold: 0.8,
      now: () => new Date("2026-09-23T00:00:00.000Z"),
    },
  );

  return { translator, embeddingGenerator, vectorIndex, repository, useCase };
}

describe("ConcernProcessingUseCase", () => {
  it("assigns a concern to the nearest matching cluster and persists outputs", async () => {
    const dependencies = createDependencies({
      matches: [
        { id: "neighbor-1", score: 0.84, clusterId: "cluster-existing" },
        { id: "neighbor-2", score: 0.79, clusterId: "cluster-other" },
      ],
    });

    await dependencies.useCase.execute(message);

    expect(dependencies.translator.convertToHiragana).toHaveBeenCalledWith(
      "疲れています",
    );
    expect(dependencies.translator.translateToEnglish).toHaveBeenCalledWith(
      "疲れています",
    );
    expect(
      dependencies.embeddingGenerator.generateEmbeddings,
    ).toHaveBeenCalledWith(["疲れています"]);
    expect(dependencies.repository.assignCluster).toHaveBeenCalledWith(
      "concern-1",
      "cluster-existing",
      "@cf/pfnet/plamo-embedding-1b",
      "2026-09-23T00:00:00.000Z",
    );
    expect(dependencies.vectorIndex.upsert).toHaveBeenCalledWith({
      concernId: "concern-1",
      clusterId: "cluster-existing",
      embedding: [0.1, 0.2],
    });
    expect(dependencies.repository.saveResult).toHaveBeenCalledWith(
      "concern-1",
      { jaHira: "つかれています", en: "I am tired" },
      "2026-09-23T00:00:00.000Z",
    );
  });

  it("starts a new cluster when the nearest score is below the threshold", async () => {
    const { repository, vectorIndex, useCase } = createDependencies({
      matches: [{ id: "neighbor-1", score: 0.79, clusterId: "cluster-old" }],
    });

    await useCase.execute(message);

    expect(repository.assignCluster).toHaveBeenCalledWith(
      "concern-1",
      "concern-1",
      "@cf/pfnet/plamo-embedding-1b",
      "2026-09-23T00:00:00.000Z",
    );
    expect(vectorIndex.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ clusterId: "concern-1" }),
    );
  });

  it("reuses a persisted cluster assignment when retrying a failed job", async () => {
    const { repository, vectorIndex, useCase } = createDependencies({
      status: "failed",
      clusterId: "cluster-persisted",
    });

    await useCase.execute(message);

    expect(vectorIndex.search).not.toHaveBeenCalled();
    expect(repository.assignCluster).toHaveBeenCalledWith(
      "concern-1",
      "cluster-persisted",
      "@cf/pfnet/plamo-embedding-1b",
      "2026-09-23T00:00:00.000Z",
    );
  });

  it("does not repeat AI or Vectorize work after successful processing", async () => {
    const { translator, embeddingGenerator, vectorIndex, repository, useCase } =
      createDependencies({ status: "ready", clusterId: "cluster-1" });

    await useCase.execute(message);

    expect(translator.convertToHiragana).not.toHaveBeenCalled();
    expect(translator.translateToEnglish).not.toHaveBeenCalled();
    expect(embeddingGenerator.generateEmbeddings).not.toHaveBeenCalled();
    expect(vectorIndex.search).not.toHaveBeenCalled();
    expect(vectorIndex.upsert).not.toHaveBeenCalled();
    expect(repository.markProcessing).not.toHaveBeenCalled();
  });

  it("marks the concern failed and retries when an upstream step fails", async () => {
    const dependencies = createDependencies();
    vi.mocked(
      dependencies.embeddingGenerator.generateEmbeddings,
    ).mockRejectedValue(new Error("Workers AI unavailable"));

    await expect(dependencies.useCase.execute(message)).rejects.toThrow(
      "Workers AI unavailable",
    );
    expect(dependencies.repository.markFailed).toHaveBeenCalledWith(
      "concern-1",
      "2026-09-23T00:00:00.000Z",
    );
    expect(dependencies.vectorIndex.upsert).not.toHaveBeenCalled();
  });

  it("rejects invalid messages before reading state or calling providers", async () => {
    const dependencies = createDependencies();

    await expect(
      dependencies.useCase.execute({
        ...message,
        type: "unknown" as typeof CONCERN_PROCESSING_MESSAGE_TYPE,
      }),
    ).rejects.toThrow(TypeError);
    expect(dependencies.repository.findState).not.toHaveBeenCalled();
    expect(dependencies.translator.convertToHiragana).not.toHaveBeenCalled();
    expect(
      dependencies.embeddingGenerator.generateEmbeddings,
    ).not.toHaveBeenCalled();
  });
});
