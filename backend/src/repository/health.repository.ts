import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

export interface HealthRepository {
  pingDB(): Promise<void>;
}

class D1HealthRepository implements HealthRepository {
  private readonly db: ReturnType<typeof drizzle>;

  constructor(d1: D1Database) {
    this.db = drizzle(d1);
  }

  // pingDB はD1への疎通を確認する。
  // クエリ結果の中身は問わない。SELECTが例外なく完了することが
  // バインディングへの疎通確認となる(Firestore版の`_health/ping`と同じ考え方)。
  async pingDB(): Promise<void> {
    await this.db.run(sql`select 1`);
  }
}

export function newHealthRepository(d1: D1Database): HealthRepository {
  return new D1HealthRepository(d1);
}
