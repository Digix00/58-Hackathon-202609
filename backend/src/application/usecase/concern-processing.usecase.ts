import { CONCERN_BODY_MAX_LENGTH } from "../entity/concern";
import {
  CONCERN_PROCESSING_MESSAGE_TYPE,
  type ConcernProcessingMessage,
} from "../port/concern-processing-queue";
import type { ConcernVectorIndex } from "../port/concern-vector-index";
import type { TextEmbeddingGenerator } from "../port/text-embedding-generator";
import type { TextTranslator } from "../port/text-translator";
import type { ConcernProcessingRepository } from "../repository/concern-processing.repository";

export const CONCERN_EMBEDDING_MODEL = "@cf/pfnet/plamo-embedding-1b";
export const DEFAULT_CONCERN_CLUSTER_SIMILARITY_THRESHOLD = 0.8;

const NEAREST_CONCERN_LIMIT = 5;

export interface IConcernProcessingUseCase {
  execute(message: ConcernProcessingMessage): Promise<void>;
}

export interface ConcernProcessingUseCaseOptions {
  similarityThreshold?: number;
  now?: () => Date;
}

/**
 * Generates display representations, stores the embedding in Vectorize, and
 * persists the resulting cluster assignment and text in D1.
 */
export class ConcernProcessingUseCase implements IConcernProcessingUseCase {
  private readonly translator: TextTranslator;
  private readonly embeddingGenerator: TextEmbeddingGenerator;
  private readonly vectorIndex: ConcernVectorIndex;
  private readonly repository: ConcernProcessingRepository;
  private readonly similarityThreshold: number;
  private readonly now: () => Date;

  constructor(
    translator: TextTranslator,
    embeddingGenerator: TextEmbeddingGenerator,
    vectorIndex: ConcernVectorIndex,
    repository: ConcernProcessingRepository,
    options: ConcernProcessingUseCaseOptions = {},
  ) {
    const similarityThreshold =
      options.similarityThreshold ??
      DEFAULT_CONCERN_CLUSTER_SIMILARITY_THRESHOLD;
    if (
      !Number.isFinite(similarityThreshold) ||
      similarityThreshold < 0 ||
      similarityThreshold > 1
    ) {
      throw new RangeError("similarityThreshold must be between 0 and 1");
    }

    this.translator = translator;
    this.embeddingGenerator = embeddingGenerator;
    this.vectorIndex = vectorIndex;
    this.repository = repository;
    this.similarityThreshold = similarityThreshold;
    this.now = options.now ?? (() => new Date());
  }

  readonly execute = async (
    message: ConcernProcessingMessage,
  ): Promise<void> => {
    const input = validateMessage(message);
    const state = await this.repository.findState(input.concernId);
    if (!state) {
      throw new Error("Concern not found for processing");
    }
    if (state.status === "ready") {
      return;
    }

    try {
      await this.repository.markProcessing(input.concernId, this.nowIso());
      const [jaHira, en, embeddings] = await Promise.all([
        this.translator.convertToHiragana(input.body),
        this.translator.translateToEnglish(input.body),
        this.embeddingGenerator.generateEmbeddings([input.body]),
      ]);
      const embedding = embeddings[0];
      if (!embedding) {
        throw new Error("Workers AI returned no embedding for the concern");
      }

      const proposedClusterId =
        state.clusterId ??
        (await this.findMatchingCluster(embedding)) ??
        input.concernId;
      const clusterId = await this.repository.assignCluster(
        input.concernId,
        proposedClusterId,
        CONCERN_EMBEDDING_MODEL,
        this.nowIso(),
      );

      // Persist the stable D1 assignment first. If the Queue redelivers after a
      // Vectorize or D1 failure, the next attempt reuses the same cluster ID.
      await this.vectorIndex.upsert({
        concernId: input.concernId,
        clusterId,
        embedding,
      });
      await this.repository.saveResult(
        input.concernId,
        { jaHira, en },
        this.nowIso(),
      );
    } catch (error) {
      await this.repository
        .markFailed(input.concernId, this.nowIso())
        .catch(() => undefined);
      throw error;
    }
  };

  private async findMatchingCluster(
    embedding: readonly number[],
  ): Promise<string | null> {
    const matches = await this.vectorIndex.search(
      embedding,
      NEAREST_CONCERN_LIMIT,
    );

    return (
      matches
        .filter(
          (match) =>
            match.score >= this.similarityThreshold && match.clusterId !== null,
        )
        .sort((left, right) => right.score - left.score)[0]?.clusterId ?? null
    );
  }

  private nowIso(): string {
    return this.now().toISOString();
  }
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
