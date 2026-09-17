import type { HealthRepository } from "../repository/health.repository";

export interface HealthStatus {
  status: string;
  checkedAt: string;
  database: string;
}

export async function checkHealth(repo: HealthRepository): Promise<HealthStatus> {
  let database = "ok";
  try {
    await repo.pingDB();
  } catch {
    database = "error";
  }

  return {
    status: "ok",
    checkedAt: new Date().toISOString(),
    database,
  };
}
