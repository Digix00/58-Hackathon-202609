import { CONCERN_BODY_MAX_LENGTH } from "../entity/concern";
import { ConcernCluster } from "../entity/concern-cluster";
import {
  ConcernProcessing,
  ConcernRepresentation,
} from "../entity/concern-processing";
import type { ConcernClusterSummaryGenerator } from "../port/concern-cluster-summary-generator";
import {
  CONCERN_PROCESSING_MESSAGE_TYPE,
  type ConcernProcessingMessage,
} from "../port/concern-processing-queue";
import type { ConcernVectorIndex } from "../port/concern-vector-index";
import type { TextEmbeddingGenerator } from "../port/text-embedding-generator";
import type { TextTranslator } from "../port/text-translator";
import type { ConcernClusterSummaryRepository } from "../repository/concern-cluster-summary.repository";
import type { ConcernProcessingRepository } from "../repository/concern-processing.repository";

export const DEFAULT_CONCERN_CLUSTER_SIMILARITY_THRESHOLD = 0.8;

const NEAREST_CONCERN_LIMIT = 10;

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
  similarityThreshold?: number;
  vectorIndexVersion?: string;
  now?: () => Date;
}

/**
 * Generates text representations and embeddings for one concern, then persists
 * the generated text and assigns a semantic cluster when Vectorize is configured.
 */
export class ConcernProcessingUseCase implements IConcernProcessingUseCase {
  private readonly translator: TextTranslator;
  private readonly embeddingGenerator: TextEmbeddingGenerator;
  private readonly repository?: ConcernProcessingRepository;
  private readonly vectorIndex?: ConcernVectorIndex;
  private readonly clusterSummaryRepository?: ConcernClusterSummaryRepository;
  private readonly clusterSummaryGenerator?: ConcernClusterSummaryGenerator;
  private readonly similarityThreshold: number;
  private readonly vectorIndexVersion: string;
  private readonly now: () => Date;

  constructor(
    translator: TextTranslator,
    embeddingGenerator: TextEmbeddingGenerator,
    repository?: ConcernProcessingRepository,
    vectorIndex?: ConcernVectorIndex,
    options: ConcernProcessingUseCaseOptions = {},
    clusterSummaryRepository?: ConcernClusterSummaryRepository,
    clusterSummaryGenerator?: ConcernClusterSummaryGenerator,
  ) {
    if (vectorIndex && !repository) {
      throw new TypeError(
        "Vectorize index requires a concern processing repository",
      );
    }
    if (
      Boolean(clusterSummaryRepository) !== Boolean(clusterSummaryGenerator)
    ) {
      throw new TypeError(
        "cluster summary repository and generator must be provided together",
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
    this.repository = repository;
    this.vectorIndex = vectorIndex;
    this.clusterSummaryRepository = clusterSummaryRepository;
    this.clusterSummaryGenerator = clusterSummaryGenerator;
    this.similarityThreshold = similarityThreshold;
    this.vectorIndexVersion = options.vectorIndexVersion?.trim() || "default";
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

    const modelVersion = this.embeddingGenerator.modelVersion ?? "unknown";
    const embeddingVersion = `${modelVersion}@${this.vectorIndexVersion}`;
    const processingTimestamp = this.nowIso();
    try {
    if (
      state?.status === "ready" &&
      hasCompleteRepresentations(state.representations) &&
      (!vectorIndex ||
        (state.clusterId !== null &&
          state.embeddingVersion === embeddingVersion))
    ) {
      if (state.clusterId) {
        await this.generatePendingClusterSummary(state.clusterId);
      }
      return null;
    }
      if (repository) {
        await repository.markProcessing(
          new ConcernProcessing({
            concernId: input.concernId,
            status: "processing",
            clusterId: state?.clusterId,
            modelVersion,
            updatedAt: processingTimestamp,
          }),
        );
      }

      const [jaHira, en, embedding] = await Promise.all([
        findReadyRepresentation(state, "ja-Hira") ??
          this.translator.convertToHiragana(input.body),
        findReadyRepresentation(state, "en") ??
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
        let clusterId = state?.clusterId ?? null;

        if (vectorIndex) {
          if (!embedding) {
            await repository.saveResult(
              new ConcernProcessing({
                concernId: input.concernId,
                status: "failed",
                clusterId,
                modelVersion,
                embeddingVersion: state?.embeddingVersion,
                representations,
                updatedAt: this.nowIso(),
              }),
            );
            throw new Error("Embedding generation returned no vector");
          }

          const proposedClusterId =
            clusterId ??
            (await this.findMatchingCluster(vectorIndex, embedding)) ??
            input.concernId;
          const assignment = await repository.assignCluster(
            new ConcernProcessing({
              concernId: input.concernId,
              status: "processing",
              clusterId: proposedClusterId,
              modelVersion,
              embeddingVersion,
              representations,
              updatedAt: this.nowIso(),
            }),
          );
          if (!assignment.clusterId) {
            throw new Error(
              "Concern processing repository returned no cluster ID",
            );
          }
          clusterId = assignment.clusterId;

          // D1 persists the stable assignment first so Queue retries reuse it.
          await vectorIndex.upsert({
            concernId: input.concernId,
            clusterId,
            embedding,
          });
          await this.generatePendingClusterSummary(clusterId);
        }

        await repository.saveResult(
          new ConcernProcessing({
            concernId: input.concernId,
            status: "ready",
            clusterId,
            modelVersion,
            embeddingVersion: vectorIndex
              ? embeddingVersion
              : (state?.embeddingVersion ?? null),
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
            clusterId: state?.clusterId,
            modelVersion,
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

  private async generatePendingClusterSummary(
    clusterId: string,
  ): Promise<void> {
    const repository = this.clusterSummaryRepository;
    const generator = this.clusterSummaryGenerator;
    if (!repository || !generator) {
      return;
    }

    const input = await repository.findPendingSummaryInput(clusterId);
    if (!input) {
      return;
    }

    const summary = await generator.generate(input);
    await repository.saveSummary(
      new ConcernCluster({
        id: clusterId,
        label: summary.label,
        summary: summary.summary,
        status: "ready",
        updatedAt: this.nowIso(),
      }),
    );
  }

  /**
   * A failed embedding must not discard generated representations. Without a
   * Vectorize index they can still complete; with one, the caller saves them
   * as failed and lets the Queue retry the missing vector step.
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

function findReadyRepresentation(
  processing: ConcernProcessing | null,
  locale: ConcernRepresentation["locale"],
): string | null {
  const representation = processing?.representations.find(
    (candidate) => candidate.locale === locale && candidate.status === "ready",
  );
  return representation?.body ?? null;
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
