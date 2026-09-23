import { createApp } from "../app/create-app";
import { AuthUseCase } from "../application/usecase/auth.usecase";
import { CheckHealthUseCase } from "../application/usecase/check-health.usecase";
import { ConcernUseCase } from "../application/usecase/concern.usecase";
import { UserUseCase } from "../application/usecase/user.usecase";
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
  const userUseCase = new UserUseCase(userRepository);
  const authHandler = new AuthHandler(authUseCase, sessionTtlSeconds);
  const userHandler = new UserHandler(userUseCase);

  return createApp({
    authHandler,
    authUseCase,
    concernHandler,
    healthHandler,
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
