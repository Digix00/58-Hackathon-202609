import { CONCERN_BODY_MAX_LENGTH } from "../entity/concern";
import {
  ConcernProcessing,
  ConcernRepresentation,
} from "../entity/concern-processing";
import {
  CONCERN_PROCESSING_MESSAGE_TYPE,
  type ConcernProcessingMessage,
} from "../port/concern-processing-queue";
import type { ConcernVectorIndex } from "../port/concern-vector-index";
import type { TextEmbeddingGenerator } from "../port/text-embedding-generator";
import type { TextTranslator } from "../port/text-translator";
import type { ConcernProcessingRepository } from "../repository/concern-processing.repository";

export const DEFAULT_CONCERN_CLUSTER_SIMILARITY_THRESHOLD = 0.8;

const NEAREST_CONCERN_LIMIT = 5;

export interface ConcernProcessingResult {
  concernId: string;
  representations: {
    jaHira: string;
    en: string;
  };
  embedding: readonly number[];
}

export interface IConcernProcessingUseCase {
  execute(
    message: ConcernProcessingMessage,
  ): Promise<ConcernProcessingResult | null>;
}

export interface ConcernProcessingUseCaseOptions {
  similarityThreshold?: number;
  now?: () => Date;
}

/**
 * Generates text representations and embeddings, then assigns and indexes the
 * concern in a semantic cluster when the Vectorize dependencies are configured.
 */
export class ConcernProcessingUseCase implements IConcernProcessingUseCase {
  private readonly translator: TextTranslator;
  private readonly embeddingGenerator: TextEmbeddingGenerator;
  private readonly vectorIndex?: ConcernVectorIndex;
  private readonly repository?: ConcernProcessingRepository;
  private readonly similarityThreshold: number;
  private readonly now: () => Date;

  constructor(
    translator: TextTranslator,
    embeddingGenerator: TextEmbeddingGenerator,
    vectorIndex?: ConcernVectorIndex,
    repository?: ConcernProcessingRepository,
    options: ConcernProcessingUseCaseOptions = {},
  ) {
    if ((vectorIndex === undefined) !== (repository === undefined)) {
      throw new TypeError(
        "Vectorize index and concern processing repository must be configured together",
      );
    }

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
  ): Promise<ConcernProcessingResult | null> => {
    const input = validateMessage(message);
    const repository = this.repository;
    const vectorIndex = this.vectorIndex;
    const state = repository
      ? await repository.findState(input.concernId)
      : null;

    if (repository && !state) {
      throw new Error("Concern not found for processing");
    }
    if (state?.status === "ready") {
      return null;
    }

    const modelVersion = this.embeddingGenerator.modelVersion ?? "unknown";
    const processingTimestamp = this.nowIso();
    const processing = new ConcernProcessing({
      concernId: input.concernId,
      status: "processing",
      clusterId: state?.clusterId,
      modelVersion,
      updatedAt: processingTimestamp,
    });

    try {
      if (repository) {
        await repository.markProcessing(processing);
      }

      const [jaHira, en, embeddings] = await Promise.all([
        this.translator.convertToHiragana(input.body),
        this.translator.translateToEnglish(input.body),
        this.embeddingGenerator.generateEmbeddings([input.body]),
      ]);
      const embedding = embeddings[0];

      if (!embedding) {
        throw new Error("Workers AI returned no embedding for the concern");
      }

      const result = {
        concernId: input.concernId,
        representations: { jaHira, en },
        embedding,
      };

      if (!repository || !vectorIndex || !state) {
        return result;
      }

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
      const proposedClusterId =
        state.clusterId ??
        (await this.findMatchingCluster(vectorIndex, embedding)) ??
        input.concernId;
      const assignment = await repository.assignCluster(
        new ConcernProcessing({
          concernId: input.concernId,
          status: "processing",
          clusterId: proposedClusterId,
          modelVersion,
          representations,
          updatedAt: this.nowIso(),
        }),
      );
      if (!assignment.clusterId) {
        throw new Error("Concern processing repository returned no cluster ID");
      }

      // Store the stable D1 assignment first so Queue retries reuse its ID.
      await vectorIndex.upsert({
        concernId: input.concernId,
        clusterId: assignment.clusterId,
        embedding,
      });
      await repository.saveResult(
        new ConcernProcessing({
          concernId: input.concernId,
          status: "ready",
          clusterId: assignment.clusterId,
          modelVersion,
          representations,
          updatedAt: this.nowIso(),
        }),
      );

      return result;
    } catch (error) {
      await repository
        ?.markFailed(
          new ConcernProcessing({
            concernId: input.concernId,
            status: "failed",
            clusterId: state?.clusterId,
            modelVersion,
            updatedAt: this.nowIso(),
          }),
        )
        .catch(() => undefined);
      throw error;
    }
  };

  private async findMatchingCluster(
    vectorIndex: ConcernVectorIndex,
    embedding: readonly number[],
  ): Promise<string | null> {
    const matches = await vectorIndex.search(embedding, NEAREST_CONCERN_LIMIT);

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
