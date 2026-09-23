import { describe, expect, it, vi } from "vitest";
import {
  CONCERN_PROCESSING_MESSAGE_TYPE,
  type ConcernProcessingMessage,
} from "../../../src/application/port/concern-processing-queue";
import type { TextEmbeddingGenerator } from "../../../src/application/port/text-embedding-generator";
import type { TextTranslator } from "../../../src/application/port/text-translator";
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
});
