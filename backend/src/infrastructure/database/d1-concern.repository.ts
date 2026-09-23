import { and, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import {
  type AgeGroup,
  Concern,
  type ConcernProcessingStatus,
  type ConcernVisibilityStatus,
  type Gender,
} from "../../application/entity/concern";
import { ConcernCluster } from "../../application/entity/concern-cluster";
import type {
  ConcernRepository,
  ListConcernFeedByIdsInput,
  ListConcernFeedInput,
  ListConcernFeedResult,
  ListPublishedConcernsInput,
  ListPublishedConcernsResult,
} from "../../application/repository/concern.repository";
import {
  concernClusters,
  concerns,
  concernViews,
  feedImpressions,
} from "./schema";

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
        clusterId: concern.clusterId,
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
      .select()
      .from(concerns)
      .where(where)
      .orderBy(desc(concerns.createdAt), desc(concerns.id))
      .limit(input.limit + 1)
      .all();
    const hasMore = rows.length > input.limit;

    return {
      items: rows.slice(0, input.limit).map(toConcern),
      hasMore,
    };
  }

  async findPublishedById(id: string): Promise<Concern | null> {
    const row = await this.db
      .select()
      .from(concerns)
      .where(
        and(eq(concerns.id, id), eq(concerns.visibilityStatus, "published")),
      )
      .get();

    return row ? toConcern(row) : null;
  }

  async listFeed(input: ListConcernFeedInput): Promise<ListConcernFeedResult> {
    const conditions = [eq(concerns.visibilityStatus, "published")];
    if (input.regionCode) {
      conditions.push(eq(concerns.regionCode, input.regionCode));
    }
    if (input.clusterId) {
      conditions.push(eq(concerns.clusterId, input.clusterId));
    }
    if (input.cursor) {
      const cursorCondition = or(
        lt(concerns.createdAt, input.cursor.createdAt),
        and(
          eq(concerns.createdAt, input.cursor.createdAt),
          lt(concerns.id, input.cursor.id),
        ),
      );
      if (cursorCondition) {
        conditions.push(cursorCondition);
      }
    }

    const viewJoin = input.userId
      ? and(
          eq(concernViews.concernId, concerns.id),
          eq(concernViews.actorKey, input.userId),
        )
      : sql`1 = 0`;
    const rows = await this.db
      .select({
        concern: concerns,
        cluster: concernClusters,
        view: concernViews,
      })
      .from(concerns)
      .leftJoin(concernClusters, eq(concerns.clusterId, concernClusters.id))
      .leftJoin(concernViews, viewJoin)
      .where(and(...conditions))
      .orderBy(desc(concerns.createdAt), desc(concerns.id))
      .limit(input.limit + 1)
      .all();
    const hasMore = rows.length > input.limit;

    return {
      items: rows.slice(0, input.limit).map(toFeedCandidate),
      hasMore,
    };
  }

  async listFeedByIds(
    input: ListConcernFeedByIdsInput,
  ): Promise<ReturnType<typeof toFeedCandidate>[]> {
    if (input.ids.length === 0) {
      return [];
    }

    const conditions = [
      eq(concerns.visibilityStatus, "published"),
      inArray(concerns.id, input.ids),
    ];
    if (input.regionCode) {
      conditions.push(eq(concerns.regionCode, input.regionCode));
    }
    if (input.clusterId) {
      conditions.push(eq(concerns.clusterId, input.clusterId));
    }

    const viewJoin = input.userId
      ? and(
          eq(concernViews.concernId, concerns.id),
          eq(concernViews.actorKey, input.userId),
        )
      : sql`1 = 0`;
    const rows = await this.db
      .select({
        concern: concerns,
        cluster: concernClusters,
        view: concernViews,
      })
      .from(concerns)
      .leftJoin(concernClusters, eq(concerns.clusterId, concernClusters.id))
      .leftJoin(concernViews, viewJoin)
      .where(and(...conditions))
      .all();

    return rows.map(toFeedCandidate);
  }

  async findPublishedFeedCandidate(id: string, userId?: string) {
    const viewJoin = userId
      ? and(
          eq(concernViews.concernId, concerns.id),
          eq(concernViews.actorKey, userId),
        )
      : sql`1 = 0`;
    const row = await this.db
      .select({
        concern: concerns,
        cluster: concernClusters,
        view: concernViews,
      })
      .from(concerns)
      .leftJoin(concernClusters, eq(concerns.clusterId, concernClusters.id))
      .leftJoin(concernViews, viewJoin)
      .where(
        and(eq(concerns.id, id), eq(concerns.visibilityStatus, "published")),
      )
      .get();

    return row ? toFeedCandidate(row) : null;
  }

  async listRecommendationHistory(userId: string, limit: number) {
    const rows = await this.db
      .select({
        clusterId: concerns.clusterId,
        regionCode: concerns.regionCode,
        viewedAt: concernViews.viewedAt,
      })
      .from(concernViews)
      .innerJoin(concerns, eq(concernViews.concernId, concerns.id))
      .where(
        and(
          eq(concernViews.actorKey, userId),
          eq(concerns.visibilityStatus, "published"),
        ),
      )
      .orderBy(desc(concernViews.viewedAt))
      .limit(limit)
      .all();

    return rows;
  }

  async recordFeedImpressions(
    impressions: Parameters<
      NonNullable<ConcernRepository["recordFeedImpressions"]>
    >[0],
  ): Promise<void> {
    if (impressions.length === 0) {
      return;
    }

    await this.db
      .insert(feedImpressions)
      .values(
        impressions.map((impression) => ({
          id: impression.id,
          userId: impression.userId,
          concernId: impression.concernId,
          strategy: impression.strategy,
          reasonCode: impression.reasonCode,
          algorithmVersion: impression.algorithmVersion,
          position: impression.position,
          exposedAt: impression.exposedAt,
          openedAt: impression.openedAt ?? null,
        })),
      )
      .run();
  }
}

function toConcern(row: typeof concerns.$inferSelect): Concern {
  return new Concern({
    id: row.id,
    userId: row.userId,
    body: row.body,
    ageGroup: row.ageGroup as AgeGroup | null,
    gender: row.genderCode as Gender | null,
    regionCode: row.regionCode,
    clusterId: row.clusterId,
    visibilityStatus: row.visibilityStatus as ConcernVisibilityStatus,
    processingStatus: row.processingStatus as ConcernProcessingStatus,
    createdAt: row.createdAt,
  });
}

function toConcernCluster(
  row: typeof concernClusters.$inferSelect | null,
): ConcernCluster | null {
  return row
    ? new ConcernCluster({
        id: row.id,
        label: row.label,
        summary: row.summary,
        status: row.status,
        modelVersion: row.modelVersion,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })
    : null;
}

function toFeedCandidate(row: {
  concern: typeof concerns.$inferSelect;
  cluster: typeof concernClusters.$inferSelect | null;
  view: typeof concernViews.$inferSelect | null;
}) {
  return {
    concern: toConcern(row.concern),
    cluster: toConcernCluster(row.cluster),
    viewed: row.view !== null,
  };
}
