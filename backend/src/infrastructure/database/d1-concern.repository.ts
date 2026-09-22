import { drizzle } from "drizzle-orm/d1";

import type { Concern } from "../../application/entity/concern";
import type { ConcernRepository } from "../../application/repository/concern.repository";
import { concerns } from "./schema";

/** D1/Drizzleを使ったConcernRepositoryの実装。 */
export class D1ConcernRepository implements ConcernRepository {
  private readonly db: ReturnType<typeof drizzle>;

  constructor(d1: D1Database) {
    this.db = drizzle(d1);
  }

  async insert(concern: Concern): Promise<Concern> {
    await this.db
      .insert(concerns)
      .values({
        id: concern.id,
        userId: concern.userId,
        body: concern.body,
        inputMethod: concern.inputMethod,
        ageGroup: concern.ageGroup,
        genderCode: concern.gender,
        regionCode: concern.regionCode,
        visibilityStatus: concern.visibilityStatus,
        processingStatus: concern.processingStatus,
        createdAt: concern.createdAt,
        updatedAt: concern.createdAt,
      })
      .run();

    return concern;
  }
}
