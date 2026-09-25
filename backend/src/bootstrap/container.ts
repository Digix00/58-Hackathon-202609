import { createApp } from "../app/create-app";
import { AuthUseCase } from "../application/usecase/auth.usecase";
import { CheckHealthUseCase } from "../application/usecase/check-health.usecase";
import { ConcernUseCase } from "../application/usecase/concern.usecase";
import {
  ConcernProcessingUseCase,
  DEFAULT_CONCERN_CLUSTER_SIMILARITY_THRESHOLD,
} from "../application/usecase/concern-processing.usecase";
import { ConcernReactionUseCase } from "../application/usecase/concern-reaction.usecase";
import { ConcernViewUseCase } from "../application/usecase/concern-view.usecase";
import { LineUseCase } from "../application/usecase/line.usecase";
import { QuizUseCase } from "../application/usecase/quiz.usecase";
import { UserUseCase } from "../application/usecase/user.usecase";
import { LocalConcernClusterSummaryGenerator } from "../infrastructure/ai/local-concern-cluster-summary.generator";
import { LocalTextTranslator } from "../infrastructure/ai/local-text.translator";
import { LocalTextEmbeddingGenerator } from "../infrastructure/ai/local-text-embedding.generator";
import { WorkersAiConcernClusterSummaryGenerator } from "../infrastructure/ai/workers-ai-concern-cluster-summary.generator";
import { WorkersAiTextTranslator } from "../infrastructure/ai/workers-ai-text.translator";
import { WorkersAiTextEmbeddingGenerator } from "../infrastructure/ai/workers-ai-text-embedding.generator";
import {
  D1SessionRepository,
  D1UserRepository,
} from "../infrastructure/database/d1-auth.repository";
import { D1ConcernRepository } from "../infrastructure/database/d1-concern.repository";
import { D1ConcernClusterSummaryRepository } from "../infrastructure/database/d1-concern-cluster-summary.repository";
import { D1ConcernProcessingRepository } from "../infrastructure/database/d1-concern-processing.repository";
import { D1ConcernReactionRepository } from "../infrastructure/database/d1-concern-reaction.repository";
import { D1ConcernViewRepository } from "../infrastructure/database/d1-concern-view.repository";
import { D1HealthRepository } from "../infrastructure/database/d1-health.repository";
import { D1LineRepository } from "../infrastructure/database/d1-line.repository";
import { D1QuizRepository } from "../infrastructure/database/d1-quiz.repository";
import { HmacLineSignatureVerifier } from "../infrastructure/line/hmac-line-signature.verifier";
import { LineApiClient } from "../infrastructure/line/line-api.client";
import { LineBroadcastApiSender } from "../infrastructure/line/line-broadcast.sender";
import { LocalLineBroadcastSender } from "../infrastructure/line/local-line-broadcast.sender";
import { CloudflareConcernProcessingConsumer } from "../infrastructure/queue/cloudflare-concern-processing.consumer";
import { CloudflareConcernProcessingQueue } from "../infrastructure/queue/cloudflare-concern-processing.queue";
import { CloudflareConcernVectorIndex } from "../infrastructure/vectorize/cloudflare-concern-vector-index";
import { AuthHandler } from "../presentation/auth.handler";
import { ConcernHandler } from "../presentation/concern.handler";
import { ConcernReactionHandler } from "../presentation/concern-reaction.handler";
import { ConcernViewHandler } from "../presentation/concern-view.handler";
import { HealthHandler } from "../presentation/health.handler";
import { LineHandler } from "../presentation/line.handler";
import { QuizHandler } from "../presentation/quiz.handler";
import { UserHandler } from "../presentation/user.handler";
import type { Bindings } from "../types";

/**
 * アプリケーション全体のComposition Root。
 * 新しい機能の依存グラフはここへ追加し、各レイヤーでは組み立てない。
 */
export function createApplication(bindings: Bindings) {
  const sessionTtlSeconds = parseSessionTtl(bindings.AUTH_SESSION_TTL_SECONDS);
  const userRepository = new D1UserRepository(bindings.DB);
  const sessionRepository = new D1SessionRepository(bindings.DB);
  const lineApiClient = new LineApiClient(bindings.LINE_CHANNEL_ID);
  const authUseCase = new AuthUseCase(
    userRepository,
    sessionRepository,
    lineApiClient,
    sessionTtlSeconds,
  );
  const healthRepository = new D1HealthRepository(bindings.DB);
  const checkHealth = new CheckHealthUseCase(healthRepository);
  const healthHandler = new HealthHandler(checkHealth);

  const concernRepository = new D1ConcernRepository(bindings.DB);
  const concernProcessingRepository = new D1ConcernProcessingRepository(
    bindings.DB,
  );
  const concernClusterSummaryRepository = new D1ConcernClusterSummaryRepository(
    bindings.DB,
  );
  // AI binding はローカルの `wrangler.dev.jsonc` には存在しない。
  // その場合はCloudflareを呼ばないローカル用アダプタへ切り替える。
  const concernTextTranslator = bindings.AI
    ? new WorkersAiTextTranslator(bindings.AI)
    : new LocalTextTranslator();
  const concernTextEmbeddingGenerator = bindings.AI
    ? new WorkersAiTextEmbeddingGenerator(bindings.AI)
    : new LocalTextEmbeddingGenerator();
  const concernClusterSummaryGenerator = bindings.AI
    ? new WorkersAiConcernClusterSummaryGenerator(bindings.AI)
    : new LocalConcernClusterSummaryGenerator();
  const concernVectorIndex = bindings.CONCERN_VECTOR_INDEX
    ? new CloudflareConcernVectorIndex(bindings.CONCERN_VECTOR_INDEX)
    : undefined;
  const concernProcessingOptions = {
    similarityThreshold: parseSimilarityThreshold(
      bindings.CONCERN_CLUSTER_SIMILARITY_THRESHOLD,
    ),
    vectorIndexVersion: bindings.CONCERN_VECTOR_INDEX_VERSION,
  };
  const concernProcessingUseCase = new ConcernProcessingUseCase(
    concernTextTranslator,
    concernTextEmbeddingGenerator,
    concernProcessingRepository,
    concernVectorIndex,
    concernProcessingOptions,
    concernClusterSummaryRepository,
    concernClusterSummaryGenerator,
  );
  const concernProcessingConsumer = new CloudflareConcernProcessingConsumer(
    concernProcessingUseCase,
  );
  const concernProcessingQueue = bindings.CONCERN_PROCESSING_QUEUE
    ? new CloudflareConcernProcessingQueue(bindings.CONCERN_PROCESSING_QUEUE)
    : undefined;
  const concernUseCase = new ConcernUseCase(
    concernRepository,
    undefined,
    undefined,
    concernProcessingQueue,
  );
  const concernHandler = new ConcernHandler(concernUseCase);
  const concernReactionRepository = new D1ConcernReactionRepository(
    bindings.DB,
  );
  const concernReactionUseCase = new ConcernReactionUseCase(
    concernReactionRepository,
  );
  const concernReactionHandler = new ConcernReactionHandler(
    concernReactionUseCase,
  );
  const concernViewRepository = new D1ConcernViewRepository(bindings.DB);
  const concernViewUseCase = new ConcernViewUseCase(concernViewRepository);
  const concernViewHandler = new ConcernViewHandler(concernViewUseCase);
  const userUseCase = new UserUseCase(userRepository);
  const authHandler = new AuthHandler(authUseCase, sessionTtlSeconds);
  const userHandler = new UserHandler(userUseCase);
  const quizRepository = new D1QuizRepository(bindings.DB);
  const quizUseCase = new QuizUseCase(quizRepository);
  const quizHandler = new QuizHandler(quizUseCase);
  const lineRepository = new D1LineRepository(bindings.DB);
  const useLocalLineBroadcastSimulation =
    isLocalLineBroadcastSimulationEnabled(bindings);
  const lineBroadcastSender = useLocalLineBroadcastSimulation
    ? new LocalLineBroadcastSender()
    : new LineBroadcastApiSender(
        bindings.LINE_CHANNEL_ACCESS_TOKEN,
        bindings.CORS_ORIGIN,
      );
  const lineSignatureVerifier = new HmacLineSignatureVerifier(
    bindings.LINE_CHANNEL_SECRET,
  );
  const lineUseCase = new LineUseCase(
    lineRepository,
    lineSignatureVerifier,
    lineBroadcastSender,
    quizUseCase,
    bindings.CORS_ORIGIN,
  );
  const lineHandler = new LineHandler(lineUseCase);

  return {
    app: createApp({
      authHandler,
      authUseCase,
      concernHandler,
      concernReactionHandler,
      concernViewHandler,
      healthHandler,
      lineHandler,
      quizHandler,
      userHandler,
    }),
    queue: concernProcessingConsumer.handle,
    scheduled: lineUseCase.triggerDailyRun,
  };
}

export function isLocalLineBroadcastSimulationEnabled(
  bindings: Pick<
    Bindings,
    "DEV_AUTH_ENABLED" | "DEV_ACCESS_BYPASS" | "DEV_LINE_BROADCAST_SIMULATION"
  >,
): boolean {
  return (
    bindings.DEV_AUTH_ENABLED === "true" &&
    bindings.DEV_ACCESS_BYPASS === "true" &&
    bindings.DEV_LINE_BROADCAST_SIMULATION === "true"
  );
}

function parseSessionTtl(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseSimilarityThreshold(value: string | undefined): number {
  if (value === undefined) {
    return DEFAULT_CONCERN_CLUSTER_SIMILARITY_THRESHOLD;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new TypeError(
      "CONCERN_CLUSTER_SIMILARITY_THRESHOLD must be between 0 and 1",
    );
  }
  return parsed;
}
