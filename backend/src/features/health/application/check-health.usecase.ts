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
  constructor(
    private readonly repository: HealthRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

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
