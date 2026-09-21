import type { HealthStatus } from "../entity/health-status.entity";
import type { HealthRepository } from "../health.repository";

export interface CheckHealth {
  execute(): Promise<HealthStatus>;
}

/** Health機能のアプリケーションロジック。HTTPやD1には直接依存せず、Repository Portを介して疎通確認を行う。 */
export class CheckHealthUseCase implements CheckHealth {
  private readonly repository: HealthRepository;
  private readonly now: () => Date;
  private readonly version: string;

  constructor(
    repository: HealthRepository,
    now: () => Date = () => new Date(),
    version = "0.1.0",
  ) {
    this.repository = repository;
    this.now = now;
    this.version = version;
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
      version: this.version,
    };
  };
}
