import { describe, expect, it, vi } from "vitest";

import {
  ConcernClusterSummary,
  ConcernClusterSummaryInput,
} from "../../../src/application/entity/concern-cluster";
import { ConcernProcessing } from "../../../src/application/entity/concern-processing";
import type { ConcernClusterSummaryGenerator } from "../../../src/application/port/concern-cluster-summary-generator";
import {
  CONCERN_PROCESSING_MESSAGE_TYPE,
  type ConcernProcessingMessage,
} from "../../../src/application/port/concern-processing-queue";
import type { ConcernVectorIndex } from "../../../src/application/port/concern-vector-index";
import type { TextEmbeddingGenerator } from "../../../src/application/port/text-embedding-generator";
import type { TextTranslator } from "../../../src/application/port/text-translator";
import type { ConcernClusterSummaryRepository } from "../../../src/application/repository/concern-cluster-summary.repository";
import type { ConcernProcessingRepository } from "../../../src/application/repository/concern-processing.repository";
import { ConcernProcessingUseCase } from "../../../src/application/usecase/concern-processing.usecase";

const message: ConcernProcessingMessage = {
  type: CONCERN_PROCESSING_MESSAGE_TYPE,
  concernId: "concern-1",
  body: "学校で友人と話しづらい",
};

function createTextTranslator(): TextTranslator {
  return {
    convertToHiragana: vi
      .fn()
      .mockResolvedValue("がっこうでゆうじんとはなしづらい"),
    translateToEnglish: vi
      .fn()
      .mockResolvedValue("It is hard to talk to friends at school"),
  };
}

function createProcessingRepository(
  onReady?: () => void,
): ConcernProcessingRepository {
  return {
    findState: vi.fn().mockResolvedValue(
      new ConcernProcessing({
        concernId: message.concernId,
        status: "pending",
        updatedAt: "2026-09-24T00:00:00.000Z",
      }),
    ),
    markProcessing: vi.fn().mockResolvedValue(undefined),
    assignCluster: vi
      .fn()
      .mockImplementation(async (processing: ConcernProcessing) => processing),
    saveResult: vi
      .fn()
      .mockImplementation(async (processing: ConcernProcessing) => {
        if (processing.status === "ready") {
          onReady?.();
        }
      }),
    markFailed: vi.fn().mockResolvedValue(undefined),
  };
}

function createEmbeddingGenerator(): TextEmbeddingGenerator {
  return {
    modelVersion: "test-embedding-v1",
    generateEmbeddings: vi.fn().mockResolvedValue([[0.1, 0.2]]),
  };
}

describe("ConcernProcessingUseCase cluster summaries", () => {
  it("saves a new cluster summary before marking the concern ready", async () => {
    const events: string[] = [];
    const processingRepository = createProcessingRepository(() =>
      events.push("concern-ready"),
    );
    const summaryInput = new ConcernClusterSummaryInput({
      clusterId: "cluster-1",
      concernBodies: [message.body],
    });
    const summaryRepository: ConcernClusterSummaryRepository = {
      findPendingSummaryInput: vi.fn().mockImplementation(async () => {
        events.push("find-summary-input");
        return summaryInput;
      }),
      saveSummary: vi.fn().mockImplementation(async () => {
        events.push("save-summary");
      }),
    };
    const summaryGenerator: ConcernClusterSummaryGenerator = {
      generate: vi.fn().mockImplementation(async () => {
        events.push("generate-summary");
        return new ConcernClusterSummary({
          label: "学校での人間関係",
          summary: "友人との距離感や、周囲に相談しづらい悩みです。",
        });
      }),
    };
    const vectorIndex: ConcernVectorIndex = {
      search: vi
        .fn()
        .mockResolvedValue([
          { id: "nearby-concern", score: 0.9, clusterId: "cluster-1" },
        ]),
      upsert: vi.fn().mockImplementation(async () => {
        events.push("vector-upsert");
      }),
    };
    const useCase = new ConcernProcessingUseCase(
      createTextTranslator(),
      createEmbeddingGenerator(),
      processingRepository,
      vectorIndex,
      { now: () => new Date("2026-09-24T00:00:00.000Z") },
      summaryRepository,
      summaryGenerator,
    );

    await useCase.execute(message);

    expect(summaryGenerator.generate).toHaveBeenCalledWith(summaryInput);
    expect(summaryRepository.saveSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "cluster-1",
        label: "学校での人間関係",
        summary: "友人との距離感や、周囲に相談しづらい悩みです。",
        status: "ready",
      }),
    );
    expect(events).toEqual([
      "vector-upsert",
      "find-summary-input",
      "generate-summary",
      "save-summary",
      "concern-ready",
    ]);
  });

  it("retries the queue message when summary generation fails", async () => {
    const processingRepository = createProcessingRepository();
    const summaryRepository: ConcernClusterSummaryRepository = {
      findPendingSummaryInput: vi.fn().mockResolvedValue(
        new ConcernClusterSummaryInput({
          clusterId: "cluster-1",
          concernBodies: [message.body],
        }),
      ),
      saveSummary: vi.fn(),
    };
    const summaryGenerator: ConcernClusterSummaryGenerator = {
      generate: vi.fn().mockRejectedValue(new Error("Workers AI unavailable")),
    };
    const useCase = new ConcernProcessingUseCase(
      createTextTranslator(),
      createEmbeddingGenerator(),
      processingRepository,
      {
        search: vi
          .fn()
          .mockResolvedValue([
            { id: "nearby-concern", score: 0.9, clusterId: "cluster-1" },
          ]),
        upsert: vi.fn(),
      },
      {},
      summaryRepository,
      summaryGenerator,
    );

    await expect(useCase.execute(message)).rejects.toThrow(
      "Workers AI unavailable",
    );
    expect(summaryRepository.saveSummary).not.toHaveBeenCalled();
    expect(processingRepository.saveResult).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: "ready" }),
    );
    expect(processingRepository.markFailed).toHaveBeenCalledOnce();
  });

  it("skips model calls when a cluster summary is already complete", async () => {
    const processingRepository = createProcessingRepository();
    const summaryRepository: ConcernClusterSummaryRepository = {
      findPendingSummaryInput: vi.fn().mockResolvedValue(null),
      saveSummary: vi.fn(),
    };
    const summaryGenerator: ConcernClusterSummaryGenerator = {
      generate: vi.fn(),
    };
    const useCase = new ConcernProcessingUseCase(
      createTextTranslator(),
      createEmbeddingGenerator(),
      processingRepository,
      {
        search: vi
          .fn()
          .mockResolvedValue([
            { id: "nearby-concern", score: 0.9, clusterId: "cluster-1" },
          ]),
        upsert: vi.fn(),
      },
      {},
      summaryRepository,
      summaryGenerator,
    );

    await useCase.execute(message);

    expect(summaryGenerator.generate).not.toHaveBeenCalled();
    expect(summaryRepository.saveSummary).not.toHaveBeenCalled();
    expect(processingRepository.saveResult).toHaveBeenCalledWith(
      expect.objectContaining({ status: "ready" }),
    );
  });
});
