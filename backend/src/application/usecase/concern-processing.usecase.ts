import { CONCERN_BODY_MAX_LENGTH } from "../entity/concern";
import {
  ConcernProcessing,
  ConcernRepresentation,
} from "../entity/concern-processing";
import {
  CONCERN_PROCESSING_MESSAGE_TYPE,
  type ConcernProcessingMessage,
} from "../port/concern-processing-queue";
import type { TextEmbeddingGenerator } from "../port/text-embedding-generator";
import type { TextTranslator } from "../port/text-translator";
import type { ConcernProcessingRepository } from "../repository/concern-processing.repository";

export interface ConcernProcessingResult {
  concernId: string;
  representations: {
    jaHira: string;
    en: string;
  };
  embedding: readonly number[] | null;
}

export interface IConcernProcessingUseCase {
  execute(
    message: ConcernProcessingMessage,
  ): Promise<ConcernProcessingResult | null>;
}

export interface ConcernProcessingUseCaseOptions {
  now?: () => Date;
}

/**
 * Generates text representations and embeddings for one concern, then persists
 * the generated text when a repository is configured.
 */
export class ConcernProcessingUseCase implements IConcernProcessingUseCase {
  private readonly translator: TextTranslator;
  private readonly embeddingGenerator: TextEmbeddingGenerator;
  private readonly repository?: ConcernProcessingRepository;
  private readonly now: () => Date;

  constructor(
    translator: TextTranslator,
    embeddingGenerator: TextEmbeddingGenerator,
    repository?: ConcernProcessingRepository,
    options: ConcernProcessingUseCaseOptions = {},
  ) {
    this.translator = translator;
    this.embeddingGenerator = embeddingGenerator;
    this.repository = repository;
    this.now = options.now ?? (() => new Date());
  }

  readonly execute = async (
    message: ConcernProcessingMessage,
  ): Promise<ConcernProcessingResult | null> => {
    const input = validateMessage(message);
    const repository = this.repository;
    const state = repository
      ? await repository.findState(input.concernId)
      : null;

    if (repository && !state) {
      throw new Error("Concern not found for processing");
    }

    if (
      state?.status === "ready" &&
      hasCompleteRepresentations(state.representations)
    ) {
      return null;
    }

    const processingTimestamp = this.nowIso();
    try {
      if (repository) {
        await repository.markProcessing(
          new ConcernProcessing({
            concernId: input.concernId,
            status: "processing",
            updatedAt: processingTimestamp,
          }),
        );
      }

      const [jaHira, en, embedding] = await Promise.all([
        this.translator.convertToHiragana(input.body),
        this.translator.translateToEnglish(input.body),
        this.generateEmbedding(input.concernId, input.body),
      ]);

      const result = {
        concernId: input.concernId,
        representations: { jaHira, en },
        embedding,
      };

      if (repository) {
        const representations = [
          new ConcernRepresentation({
            concernId: input.concernId,
            locale: "ja-Hira",
            body: jaHira,
            status: "ready",
            updatedAt: processingTimestamp,
          }),
          new ConcernRepresentation({
            concernId: input.concernId,
            locale: "en",
            body: en,
            status: "ready",
            updatedAt: processingTimestamp,
          }),
        ];
        await repository.saveResult(
          new ConcernProcessing({
            concernId: input.concernId,
            status: "ready",
            representations,
            updatedAt: this.nowIso(),
          }),
        );
      }

      return result;
    } catch (error) {
      await repository
        ?.markFailed(
          new ConcernProcessing({
            concernId: input.concernId,
            status: "failed",
            updatedAt: this.nowIso(),
          }),
        )
        .catch(() => undefined);
      throw error;
    }
  };

  private nowIso(): string {
    return this.now().toISOString();
  }

  /**
   * Embedding is not persisted by this feature yet, so a failure here must
   * not block saving the ja_hira/en_translation representations that already
   * succeeded (see docs/technical/api.md §10 processingStatus contract).
   */
  private async generateEmbedding(
    concernId: string,
    body: string,
  ): Promise<readonly number[] | null> {
    try {
      const embeddings = await this.embeddingGenerator.generateEmbeddings([
        body,
      ]);
      return embeddings[0] ?? null;
    } catch (error) {
      console.error(
        JSON.stringify({
          severity: "ERROR",
          message: "embedding generation failed",
          concernId,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      return null;
    }
  }
}

function hasCompleteRepresentations(
  representations: readonly ConcernRepresentation[],
): boolean {
  return (
    representations.length === 2 &&
    representations.every(
      (representation) => representation.status === "ready",
    ) &&
    representations.some(
      (representation) => representation.locale === "ja-Hira",
    ) &&
    representations.some((representation) => representation.locale === "en")
  );
}

function validateMessage(
  message: ConcernProcessingMessage,
): ConcernProcessingMessage {
  if (
    message.type !== CONCERN_PROCESSING_MESSAGE_TYPE ||
    message.concernId.trim().length === 0 ||
    message.body.trim().length === 0 ||
    message.body.trim().length > CONCERN_BODY_MAX_LENGTH
  ) {
    throw new TypeError("invalid concern processing message");
  }

  return {
    ...message,
    concernId: message.concernId.trim(),
    body: message.body.trim(),
  };
}
