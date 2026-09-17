import type { HealthRepository } from "./health.repository";

export interface HealthStatus {
  status: "ok";
  checkedAt: string;
  database: "ok" | "error";
}

export interface CheckHealth {
  execute(): Promise<HealthStatus>;
}

/** Health機能のアプリケーションロジック。HTTPやD1には依存しない。 */
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
