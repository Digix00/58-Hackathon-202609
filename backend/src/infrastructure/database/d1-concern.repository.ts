import { drizzle } from "drizzle-orm/d1";

import type { Concern } from "../../application/entity/concern";
import type {
  ConcernRepository,
  InsertConcernInput,
} from "../../application/repository/concern.repository";
import { concerns } from "./schema";

/** D1/Drizzleを使ったConcernRepositoryの実装。 */
export class D1ConcernRepository implements ConcernRepository {
  private readonly db: ReturnType<typeof drizzle>;

  constructor(d1: D1Database) {
    this.db = drizzle(d1);
  }

  async insert(input: InsertConcernInput): Promise<Concern> {
    await this.db
      .insert(concerns)
      .values({
        id: input.id,
        userId: input.userId,
        body: input.body,
        inputMethod: input.inputMethod,
        ageGroup: input.ageGroup,
        genderCode: input.gender,
        regionCode: input.regionCode,
        visibilityStatus: "published",
        processingStatus: "pending",
        createdAt: input.createdAt,
        updatedAt: input.updatedAt,
      })
      .run();

    return {
      id: input.id,
      userId: input.userId,
      body: input.body,
      inputMethod: input.inputMethod,
      ageGroup: input.ageGroup,
      gender: input.gender,
      regionCode: input.regionCode,
      visibilityStatus: "published",
      processingStatus: "pending",
      createdAt: input.createdAt,
    };
  }
}
