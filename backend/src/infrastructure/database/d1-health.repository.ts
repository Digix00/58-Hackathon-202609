import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import type { HealthRepository } from "../../application/health.repository";

/** D1/Drizzleを使ったHealthRepositoryの実装。 */
export class D1HealthRepository implements HealthRepository {
  private readonly db: ReturnType<typeof drizzle>;

  constructor(d1: D1Database) {
    this.db = drizzle(d1);
  }

  async ping(): Promise<void> {
    await this.db.run(sql`select 1`);
  }
}
