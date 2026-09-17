import type { HealthStatus } from "../entity/health-status.entity";
import type { HealthRepository } from "../health.repository";

export interface CheckHealth {
  execute(): Promise<HealthStatus>;
}

/** Health機能のアプリケーションロジック。HTTPやD1には直接依存せず、Repository Portを介して疎通確認を行う。 */
export class CheckHealthUseCase implements CheckHealth {
  private readonly repository: HealthRepository;
  private readonly now: () => Date;

  constructor(repository: HealthRepository, now: () => Date = () => new Date()) {
    this.repository = repository;
    this.now = now;
  }

  readonly execute = async (): Promise<HealthStatus> => {
    let database: HealthStatus["database"] = "ok";
    try {
      await this.repository.ping();
    } catch {
      database = "error";
    }

    return {
      status: "ok",
      checkedAt: this.now().toISOString(),
      database,
    };
  };
}
