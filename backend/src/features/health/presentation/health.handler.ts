import { createFactory } from "hono/factory";

import type { Bindings } from "../../../types";
import type { CheckHealth } from "../application/check-health.usecase";

const factory = createFactory<{ Bindings: Bindings }>();

/**
 * HTTP層には完成済みのユースケースだけを渡す。
 * リクエスト処理中にRepositoryやUseCaseを組み立てない。
 */
export class HealthHandler {
  constructor(private readonly checkHealth: CheckHealth) {}

  readonly get = factory.createHandlers(async (c) =>
    c.json(await this.checkHealth.execute()),
  );
}
