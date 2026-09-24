import { describe, expect, it, vi } from "vitest";
import {
  ConcernProcessing,
  ConcernRepresentation,
} from "../../../src/application/entity/concern-processing";
import {
  CONCERN_PROCESSING_MESSAGE_TYPE,
  type ConcernProcessingMessage,
} from "../../../src/application/port/concern-processing-queue";
import type { ConcernVectorIndex } from "../../../src/application/port/concern-vector-index";
import type { TextEmbeddingGenerator } from "../../../src/application/port/text-embedding-generator";
import type { TextTranslator } from "../../../src/application/port/text-translator";
import type { ConcernProcessingRepository } from "../../../src/application/repository/concern-processing.repository";
import { ConcernProcessingUseCase } from "../../../src/application/usecase/concern-processing.usecase";

describe("ConcernProcessingUseCase", () => {
  it("runs both translations and embedding for one queue message", async () => {
    const translator: TextTranslator = {
      convertToHiragana: vi.fn().mockResolvedValue("つかれています"),
      translateToEnglish: vi.fn().mockResolvedValue("I am tired"),
    };
    const embeddingGenerator: TextEmbeddingGenerator = {
      generateEmbeddings: vi.fn().mockResolvedValue([[0.1, 0.2]]),
    };
    const useCase = new ConcernProcessingUseCase(
      translator,
      embeddingGenerator,
    );
    const message: ConcernProcessingMessage = {
      type: CONCERN_PROCESSING_MESSAGE_TYPE,
      concernId: "concern-1",
      body: "  疲れています  ",
    };

    await expect(useCase.execute(message)).resolves.toEqual({
      concernId: "concern-1",
      representations: {
        jaHira: "つかれています",
        en: "I am tired",
      },
      embedding: [0.1, 0.2],
    });
    expect(translator.convertToHiragana).toHaveBeenCalledWith("疲れています");
    expect(translator.translateToEnglish).toHaveBeenCalledWith("疲れています");
    expect(embeddingGenerator.generateEmbeddings).toHaveBeenCalledWith([
      "疲れています",
    ]);
  });

  it("rejects an invalid queue message before calling AI", async () => {
    const translator: TextTranslator = {
      convertToHiragana: vi.fn(),
      translateToEnglish: vi.fn(),
    };
    const embeddingGenerator: TextEmbeddingGenerator = {
      generateEmbeddings: vi.fn(),
    };
    const useCase = new ConcernProcessingUseCase(
      translator,
      embeddingGenerator,
    );

    await expect(
      useCase.execute({
        type: "unknown" as typeof CONCERN_PROCESSING_MESSAGE_TYPE,
        concernId: "concern-1",
        body: "本文",
      }),
    ).rejects.toThrow(TypeError);
    expect(translator.convertToHiragana).not.toHaveBeenCalled();
    expect(translator.translateToEnglish).not.toHaveBeenCalled();
    expect(embeddingGenerator.generateEmbeddings).not.toHaveBeenCalled();
  });

  it("saves representations and returns a null embedding when embedding generation fails without Vectorize", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const translator: TextTranslator = {
      convertToHiragana: vi.fn().mockResolvedValue("つかれています"),
      translateToEnglish: vi.fn().mockResolvedValue("I am tired"),
    };
    const embeddingGenerator: TextEmbeddingGenerator = {
      generateEmbeddings: vi
        .fn()
        .mockRejectedValue(new Error("Workers AI unavailable")),
    };
    const repository: ConcernProcessingRepository = {
      findState: vi.fn().mockResolvedValue(
        new ConcernProcessing({
          concernId: "concern-1",
          status: "pending",
          updatedAt: "2024-01-01T00:00:00.000Z",
        }),
      ),
      markProcessing: vi.fn().mockResolvedValue(undefined),
      assignCluster: vi.fn(),
      saveResult: vi.fn().mockResolvedValue(undefined),
      markFailed: vi.fn().mockResolvedValue(undefined),
    };
    const useCase = new ConcernProcessingUseCase(
      translator,
      embeddingGenerator,
      repository,
    );

    await expect(
      useCase.execute({
        type: CONCERN_PROCESSING_MESSAGE_TYPE,
        concernId: "concern-1",
        body: "疲れています",
      }),
    ).resolves.toEqual({
      concernId: "concern-1",
      representations: {
        jaHira: "つかれています",
        en: "I am tired",
      },
      embedding: null,
    });
    expect(repository.saveResult).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "ready",
        representations: expect.any(Array),
      }),
    );
    expect(repository.markFailed).not.toHaveBeenCalled();
  });

  it("saves generated representations as failed and retries when Vectorize needs a missing embedding", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const concernId = "concern-no-embedding";
    const translator: TextTranslator = {
      convertToHiragana: vi.fn().mockResolvedValue("つかれています"),
      translateToEnglish: vi.fn().mockResolvedValue("I am tired"),
    };
    const embeddingGenerator: TextEmbeddingGenerator = {
      generateEmbeddings: vi
        .fn()
        .mockRejectedValue(new Error("Workers AI unavailable")),
    };
    const repository: ConcernProcessingRepository = {
      findState: vi.fn().mockResolvedValue(
        new ConcernProcessing({
          concernId,
          status: "pending",
          updatedAt: "2026-09-24T00:00:00.000Z",
        }),
      ),
      markProcessing: vi.fn().mockResolvedValue(undefined),
      assignCluster: vi.fn(),
      saveResult: vi.fn().mockResolvedValue(undefined),
      markFailed: vi.fn().mockResolvedValue(undefined),
    };
    const vectorIndex: ConcernVectorIndex = {
      search: vi.fn(),
      upsert: vi.fn(),
    };
    const useCase = new ConcernProcessingUseCase(
      translator,
      embeddingGenerator,
      repository,
      vectorIndex,
    );

    await expect(
      useCase.execute({
        type: CONCERN_PROCESSING_MESSAGE_TYPE,
        concernId,
        body: "疲れています",
      }),
    ).rejects.toThrow("Embedding generation returned no vector");
    expect(repository.saveResult).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        representations: expect.any(Array),
      }),
    );
    expect(vectorIndex.upsert).not.toHaveBeenCalled();
  });

  it("re-registers a ready concern when its Vectorize version is stale", async () => {
    const modelVersion = "@cf/qwen/qwen3-embedding-0.6b";
    const concernId = "concern-existing";
    const clusterId = "cluster-existing";
    const timestamp = "2026-09-24T00:00:00.000Z";
    const translator: TextTranslator = {
      convertToHiragana: vi.fn(),
      translateToEnglish: vi.fn(),
    };
    const embeddingGenerator: TextEmbeddingGenerator = {
      modelVersion,
      generateEmbeddings: vi.fn().mockResolvedValue([[0.4, 0.6]]),
    };
    const repository: ConcernProcessingRepository = {
      findState: vi.fn().mockResolvedValue(
        new ConcernProcessing({
          concernId,
          status: "ready",
          clusterId,
          embeddingVersion: null,
          representations: [
            new ConcernRepresentation({
              concernId,
              locale: "ja-Hira",
              body: "すでにあるひらがな",
              status: "ready",
              updatedAt: timestamp,
            }),
            new ConcernRepresentation({
              concernId,
              locale: "en",
              body: "Existing English representation",
              status: "ready",
              updatedAt: timestamp,
            }),
          ],
          updatedAt: timestamp,
        }),
      ),
      markProcessing: vi.fn().mockResolvedValue(undefined),
      assignCluster: vi
        .fn()
        .mockImplementation(
          async (processing: ConcernProcessing) => processing,
        ),
      saveResult: vi.fn().mockResolvedValue(undefined),
      markFailed: vi.fn().mockResolvedValue(undefined),
    };
    const vectorIndex: ConcernVectorIndex = {
      search: vi.fn(),
      upsert: vi.fn().mockResolvedValue(undefined),
    };
    const useCase = new ConcernProcessingUseCase(
      translator,
      embeddingGenerator,
      repository,
      vectorIndex,
      { vectorIndexVersion: "development-v1", now: () => new Date(timestamp) },
    );

    await expect(
      useCase.execute({
        type: CONCERN_PROCESSING_MESSAGE_TYPE,
        concernId,
        body: "既存投稿本文",
      }),
    ).resolves.toMatchObject({
      concernId,
      representations: {
        jaHira: "すでにあるひらがな",
        en: "Existing English representation",
      },
    });

    expect(translator.convertToHiragana).not.toHaveBeenCalled();
    expect(translator.translateToEnglish).not.toHaveBeenCalled();
    expect(embeddingGenerator.generateEmbeddings).toHaveBeenCalledWith([
      "既存投稿本文",
    ]);
    expect(vectorIndex.upsert).toHaveBeenCalledWith({
      concernId,
      clusterId,
      embedding: [0.4, 0.6],
    });
    expect(repository.saveResult).toHaveBeenCalledWith(
      expect.objectContaining({
        embeddingVersion: `${modelVersion}@development-v1`,
      }),
    );
  });

  it("searches the ten nearest concerns when choosing a cluster", async () => {
    const concernId = "concern-new";
    const timestamp = "2026-09-24T00:00:00.000Z";
    const translator: TextTranslator = {
      convertToHiragana: vi.fn().mockResolvedValue("ひらがな"),
      translateToEnglish: vi.fn().mockResolvedValue("English"),
    };
    const embeddingGenerator: TextEmbeddingGenerator = {
      generateEmbeddings: vi.fn().mockResolvedValue([[0.4, 0.6]]),
    };
    const repository: ConcernProcessingRepository = {
      findState: vi.fn().mockResolvedValue(
        new ConcernProcessing({
          concernId,
          status: "pending",
          updatedAt: timestamp,
        }),
      ),
      markProcessing: vi.fn().mockResolvedValue(undefined),
      assignCluster: vi
        .fn()
        .mockImplementation(
          async (processing: ConcernProcessing) => processing,
        ),
      saveResult: vi.fn().mockResolvedValue(undefined),
      markFailed: vi.fn().mockResolvedValue(undefined),
    };
    const vectorIndex: ConcernVectorIndex = {
      search: vi
        .fn()
        .mockResolvedValue([
          { id: "concern-near", score: 0.9, clusterId: "cluster-near" },
        ]),
      upsert: vi.fn().mockResolvedValue(undefined),
    };
    const useCase = new ConcernProcessingUseCase(
      translator,
      embeddingGenerator,
      repository,
      vectorIndex,
      { now: () => new Date(timestamp) },
    );

    await useCase.execute({
      type: CONCERN_PROCESSING_MESSAGE_TYPE,
      concernId,
      body: "新しい投稿",
    });

    expect(vectorIndex.search).toHaveBeenCalledWith([0.4, 0.6], 10);
    expect(vectorIndex.upsert).toHaveBeenCalledWith({
      concernId,
      clusterId: "cluster-near",
      embedding: [0.4, 0.6],
    });
  });
});
