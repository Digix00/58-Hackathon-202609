import { createApp } from "../app/create-app";
import { CheckHealthUseCase } from "../application/usecase/check-health.usecase";
import { AuthUseCase } from "../application/usecase/auth.usecase";
import { ConcernUseCase } from "../application/usecase/concern.usecase";
import {
  D1SessionRepository,
  D1UserRepository,
} from "../infrastructure/database/d1-auth.repository";
import { D1ConcernRepository } from "../infrastructure/database/d1-concern.repository";
import { D1HealthRepository } from "../infrastructure/database/d1-health.repository";
import { LineApiClient } from "../infrastructure/line/line-api.client";
import { AuthHandler } from "../presentation/auth.handler";
import { ConcernHandler } from "../presentation/concern.handler";
import { HealthHandler } from "../presentation/health.handler";
import { UserHandler } from "../presentation/user.handler";
import { UserUseCase } from "../application/usecase/user.usecase";
import type { Bindings } from "../types";

/**
 * アプリケーション全体のComposition Root。
 * 新しい機能の依存グラフはここへ追加し、各レイヤーでは組み立てない。
 */
export function createApplication(bindings: Bindings) {
  const sessionTtlSeconds = parseSessionTtl(bindings.AUTH_SESSION_TTL_SECONDS);
  const userRepository = new D1UserRepository(bindings.DB);
  const authUseCase = new AuthUseCase(
    userRepository,
    new D1SessionRepository(bindings.DB),
    new LineApiClient(bindings.LINE_CHANNEL_ID),
    sessionTtlSeconds,
  );
  const healthRepository = new D1HealthRepository(bindings.DB);
  const checkHealth = new CheckHealthUseCase(healthRepository);
  const healthHandler = new HealthHandler(checkHealth);

  const concernRepository = new D1ConcernRepository(bindings.DB);
  const concernUsecase = new ConcernUseCase(concernRepository);
  const concernHandler = new ConcernHandler(concernUsecase);
  const userUseCase = new UserUseCase(userRepository);

  return createApp({
    authHandler: new AuthHandler(authUseCase, sessionTtlSeconds),
    authUseCase,
    concernHandler,
    healthHandler,
    userHandler: new UserHandler(userUseCase),
  });
}

function parseSessionTtl(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
