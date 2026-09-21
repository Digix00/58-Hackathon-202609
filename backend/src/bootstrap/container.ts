import { createApp } from "../app/create-app";
import { AuthService } from "../application/auth/auth.service";
import { CheckHealthUseCase } from "../application/usecase/check-health.usecase";
import {
  D1SessionRepository,
  D1UserRepository,
} from "../infrastructure/database/d1-auth.repository";
import { D1HealthRepository } from "../infrastructure/database/d1-health.repository";
import { LineApiClient } from "../infrastructure/line/line-api.client";
import { AuthHandler } from "../presentation/auth.handler";
import { HealthHandler } from "../presentation/health.handler";
import type { Bindings } from "../types";

/**
 * アプリケーション全体のComposition Root。
 * 新しい機能の依存グラフはここへ追加し、各レイヤーでは組み立てない。
 */
export function createApplication(bindings: Bindings) {
  const sessionTtlSeconds = parseSessionTtl(bindings.AUTH_SESSION_TTL_SECONDS);
  const authService = new AuthService(
    new D1UserRepository(bindings.DB),
    new D1SessionRepository(bindings.DB),
    new LineApiClient(bindings.LINE_CHANNEL_ID),
    sessionTtlSeconds,
  );
  const healthRepository = new D1HealthRepository(bindings.DB);
  const checkHealth = new CheckHealthUseCase(healthRepository);
  const healthHandler = new HealthHandler(checkHealth);

  return createApp({
    authHandler: new AuthHandler(authService, sessionTtlSeconds),
    authService,
    healthHandler,
  });
}

function parseSessionTtl(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
