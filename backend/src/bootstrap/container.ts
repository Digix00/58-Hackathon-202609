import { createApp } from "../app/create-app";
import { CheckHealthUseCase } from "../features/health/application/check-health.usecase";
import { D1HealthRepository } from "../features/health/infrastructure/d1-health.repository";
import { HealthHandler } from "../features/health/presentation/health.handler";
import type { Bindings } from "../types";

/**
 * アプリケーション全体のComposition Root。
 * 新しい機能の依存グラフはここへ追加し、各レイヤーでは組み立てない。
 */
export function createApplication(bindings: Bindings) {
  const healthRepository = new D1HealthRepository(bindings.DB);
  const checkHealth = new CheckHealthUseCase(healthRepository);
  const healthHandler = new HealthHandler(checkHealth);

  return createApp({ healthHandler });
}
