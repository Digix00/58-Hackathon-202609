import { createFactory } from "hono/factory";

import type { CheckHealth } from "../application/usecase/check-health.usecase";
import type { Bindings } from "../types";

const factory = createFactory<{ Bindings: Bindings }>();

/**
 * HTTP層には完成済みのユースケースだけを渡す。
 * リクエスト処理中にRepositoryやUseCaseを組み立てない。
 */
export class HealthHandler {
  private readonly checkHealth: CheckHealth;

  constructor(checkHealth: CheckHealth) {
    this.checkHealth = checkHealth;
  }

  readonly get = factory.createHandlers(async (c) =>
    c.json(await this.checkHealth.execute()),
  );
}
