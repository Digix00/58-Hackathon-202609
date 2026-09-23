import { and, desc, eq, lt, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import {
  type AgeGroup,
  Concern,
  type ConcernProcessingStatus,
  type ConcernVisibilityStatus,
  type Gender,
} from "../../application/entity/concern";
import type {
  ConcernRepository,
  ListPublishedConcernsInput,
  ListPublishedConcernsResult,
} from "../../application/repository/concern.repository";
import { concernClusters, concerns } from "./schema";

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

  async listPublished(
    input: ListPublishedConcernsInput,
  ): Promise<ListPublishedConcernsResult> {
    const cursorCondition = input.cursor
      ? or(
          lt(concerns.createdAt, input.cursor.createdAt),
          and(
            eq(concerns.createdAt, input.cursor.createdAt),
            lt(concerns.id, input.cursor.id),
          ),
        )
      : undefined;
    const where = cursorCondition
      ? and(eq(concerns.visibilityStatus, "published"), cursorCondition)
      : eq(concerns.visibilityStatus, "published");
    const rows = await this.db
      .select({ concern: concerns, cluster: concernClusters })
      .from(concerns)
      .leftJoin(concernClusters, eq(concerns.clusterId, concernClusters.id))
      .where(where)
      .orderBy(desc(concerns.createdAt), desc(concerns.id))
      .limit(input.limit + 1)
      .all();
    const hasMore = rows.length > input.limit;

    return {
      items: rows
        .slice(0, input.limit)
        .map((row) => toConcern(row.concern, row.cluster)),
      hasMore,
    };
  }

  async findPublishedById(id: string): Promise<Concern | null> {
    const row = await this.db
      .select({ concern: concerns, cluster: concernClusters })
      .from(concerns)
      .leftJoin(concernClusters, eq(concerns.clusterId, concernClusters.id))
      .where(
        and(eq(concerns.id, id), eq(concerns.visibilityStatus, "published")),
      )
      .get();

    return row ? toConcern(row.concern, row.cluster) : null;
  }
}

function toConcern(
  row: typeof concerns.$inferSelect,
  cluster: typeof concernClusters.$inferSelect | null,
): Concern {
  return new Concern({
    id: row.id,
    userId: row.userId,
    body: row.body,
    ageGroup: row.ageGroup as AgeGroup | null,
    gender: row.genderCode as Gender | null,
    regionCode: row.regionCode,
    visibilityStatus: row.visibilityStatus as ConcernVisibilityStatus,
    processingStatus: row.processingStatus as ConcernProcessingStatus,
    cluster: cluster
      ? { id: cluster.id, label: cluster.label, summary: cluster.summary }
      : null,
    createdAt: row.createdAt,
  });
}
