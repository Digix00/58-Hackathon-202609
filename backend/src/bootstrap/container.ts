import { createApp } from "../app/create-app";
import { AuthUseCase } from "../application/usecase/auth.usecase";
import { CheckHealthUseCase } from "../application/usecase/check-health.usecase";
import { ConcernUseCase } from "../application/usecase/concern.usecase";
import { ConcernReactionUseCase } from "../application/usecase/concern-reaction.usecase";
import { ConcernViewUseCase } from "../application/usecase/concern-view.usecase";
import { QuizUseCase } from "../application/usecase/quiz.usecase";
import { UserUseCase } from "../application/usecase/user.usecase";
import {
  D1SessionRepository,
  D1UserRepository,
} from "../infrastructure/database/d1-auth.repository";
import { D1ConcernRepository } from "../infrastructure/database/d1-concern.repository";
import { D1ConcernReactionRepository } from "../infrastructure/database/d1-concern-reaction.repository";
import { D1ConcernViewRepository } from "../infrastructure/database/d1-concern-view.repository";
import { D1HealthRepository } from "../infrastructure/database/d1-health.repository";
import { D1QuizRepository } from "../infrastructure/database/d1-quiz.repository";
import { LineApiClient } from "../infrastructure/line/line-api.client";
import { AuthHandler } from "../presentation/auth.handler";
import { ConcernHandler } from "../presentation/concern.handler";
import { ConcernReactionHandler } from "../presentation/concern-reaction.handler";
import { ConcernViewHandler } from "../presentation/concern-view.handler";
import { HealthHandler } from "../presentation/health.handler";
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
  const concernUseCase = new ConcernUseCase(concernRepository);
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

  return createApp({
    authHandler,
    authUseCase,
    concernHandler,
    concernReactionHandler,
    concernViewHandler,
    healthHandler,
    quizHandler,
    userHandler,
  });
}

function parseSessionTtl(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
