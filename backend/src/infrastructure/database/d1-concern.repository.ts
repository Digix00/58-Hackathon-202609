import { and, desc, eq, inArray, lt, ne, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import {
  type AgeGroup,
  Concern,
  type ConcernProcessingStatus,
  type ConcernTextRepresentation,
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
import { loadConcernRepresentations } from "./concern-representation.reader";
import {
  concernClusters,
  concernReactions,
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
    const conditions = [eq(concerns.visibilityStatus, "published")];
    if (input.excludeUserId) {
      conditions.push(ne(concerns.userId, input.excludeUserId));
    }
    if (input.gender) {
      conditions.push(eq(concerns.genderCode, input.gender));
    }
    const cursorCondition = input.cursor
      ? or(
          lt(concerns.createdAt, input.cursor.createdAt),
          and(
            eq(concerns.createdAt, input.cursor.createdAt),
            lt(concerns.id, input.cursor.id),
          ),
        )
      : undefined;
    if (cursorCondition) {
      conditions.push(cursorCondition);
    }
    const rows = await this.db
      .select()
      .from(concerns)
      .where(and(...conditions))
      .orderBy(desc(concerns.createdAt), desc(concerns.id))
      .limit(input.limit + 1)
      .all();
    const hasMore = rows.length > input.limit;
    const selectedRows = rows.slice(0, input.limit);
    const representations = await loadConcernRepresentations(
      this.db,
      selectedRows.map((row) => row.id),
    );

    return {
      items: selectedRows.map((row) =>
        toConcern(row, representations.get(row.id)),
      ),
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

    if (!row) {
      return null;
    }
    const representations = await loadConcernRepresentations(this.db, [row.id]);

    return toConcern(row, representations.get(row.id));
  }

  async listFeed(input: ListConcernFeedInput): Promise<ListConcernFeedResult> {
    const conditions = [eq(concerns.visibilityStatus, "published")];
    if (input.authorUserId) {
      conditions.push(eq(concerns.userId, input.authorUserId));
    }
    if (input.gender) {
      conditions.push(eq(concerns.genderCode, input.gender));
    }
    if (input.regionCode) {
      conditions.push(eq(concerns.regionCode, input.regionCode));
    }
    if (input.clusterId) {
      conditions.push(eq(concerns.clusterId, input.clusterId));
      conditions.push(eq(concerns.processingStatus, "ready"));
    }
    if (input.excludeUserId) {
      conditions.push(ne(concerns.userId, input.excludeUserId));
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
    const reactionCount = sql<number>`(
      select count(*)
      from ${concernReactions}
      where ${concernReactions.concernId} = ${concerns.id}
    )`.as("reaction_count");
    const reacted = input.userId
      ? sql<number>`exists (
          select 1
          from ${concernReactions}
          where ${concernReactions.concernId} = ${concerns.id}
            and ${concernReactions.userId} = ${input.userId}
        )`.as("reacted")
      : sql<number>`0`.as("reacted");
    const rows = await this.db
      .select({
        concern: concerns,
        cluster: concernClusters,
        view: concernViews,
        reactionCount,
        reacted,
      })
      .from(concerns)
      .leftJoin(concernClusters, eq(concerns.clusterId, concernClusters.id))
      .leftJoin(concernViews, viewJoin)
      .where(and(...conditions))
      .orderBy(desc(concerns.createdAt), desc(concerns.id))
      .limit(input.limit + 1)
      .all();
    const hasMore = rows.length > input.limit;
    const selectedRows = rows.slice(0, input.limit);
    const representations = await loadConcernRepresentations(
      this.db,
      selectedRows.map((row) => row.concern.id),
    );

    return {
      items: selectedRows.map((row) =>
        toFeedCandidate(row, representations.get(row.concern.id)),
      ),
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
    if (input.gender) {
      conditions.push(eq(concerns.genderCode, input.gender));
    }
    if (input.regionCode) {
      conditions.push(eq(concerns.regionCode, input.regionCode));
    }
    if (input.clusterId) {
      conditions.push(eq(concerns.clusterId, input.clusterId));
      conditions.push(eq(concerns.processingStatus, "ready"));
    }
    if (input.excludeUserId) {
      conditions.push(ne(concerns.userId, input.excludeUserId));
    }

    const viewJoin = input.userId
      ? and(
          eq(concernViews.concernId, concerns.id),
          eq(concernViews.actorKey, input.userId),
        )
      : sql`1 = 0`;
    const reactionCount = sql<number>`(
      select count(*)
      from ${concernReactions}
      where ${concernReactions.concernId} = ${concerns.id}
    )`.as("reaction_count");
    const reacted = input.userId
      ? sql<number>`exists (
          select 1
          from ${concernReactions}
          where ${concernReactions.concernId} = ${concerns.id}
            and ${concernReactions.userId} = ${input.userId}
        )`.as("reacted")
      : sql<number>`0`.as("reacted");
    const rows = await this.db
      .select({
        concern: concerns,
        cluster: concernClusters,
        view: concernViews,
        reactionCount,
        reacted,
      })
      .from(concerns)
      .leftJoin(concernClusters, eq(concerns.clusterId, concernClusters.id))
      .leftJoin(concernViews, viewJoin)
      .where(and(...conditions))
      .all();

    const representations = await loadConcernRepresentations(
      this.db,
      rows.map((row) => row.concern.id),
    );

    return rows.map((row) =>
      toFeedCandidate(row, representations.get(row.concern.id)),
    );
  }

  async findPublishedFeedCandidate(id: string, userId?: string) {
    const viewJoin = userId
      ? and(
          eq(concernViews.concernId, concerns.id),
          eq(concernViews.actorKey, userId),
        )
      : sql`1 = 0`;
    const reactionCount = sql<number>`(
      select count(*)
      from ${concernReactions}
      where ${concernReactions.concernId} = ${concerns.id}
    )`.as("reaction_count");
    const reacted = userId
      ? sql<number>`exists (
          select 1
          from ${concernReactions}
          where ${concernReactions.concernId} = ${concerns.id}
            and ${concernReactions.userId} = ${userId}
        )`.as("reacted")
      : sql<number>`0`.as("reacted");
    const row = await this.db
      .select({
        concern: concerns,
        cluster: concernClusters,
        view: concernViews,
        reactionCount,
        reacted,
      })
      .from(concerns)
      .leftJoin(concernClusters, eq(concerns.clusterId, concernClusters.id))
      .leftJoin(concernViews, viewJoin)
      .where(
        and(eq(concerns.id, id), eq(concerns.visibilityStatus, "published")),
      )
      .get();

    if (!row) {
      return null;
    }
    const representations = await loadConcernRepresentations(this.db, [
      row.concern.id,
    ]);

    return toFeedCandidate(row, representations.get(row.concern.id));
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

function toConcern(
  row: typeof concerns.$inferSelect,
  representations: readonly ConcernTextRepresentation[] = [],
): Concern {
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
    representations,
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

function toFeedCandidate(
  row: {
    concern: typeof concerns.$inferSelect;
    cluster: typeof concernClusters.$inferSelect | null;
    view: typeof concernViews.$inferSelect | null;
    reactionCount?: number | null;
    reacted?: number | boolean | null;
  },
  representations: readonly ConcernTextRepresentation[] = [],
) {
  return {
    concern: toConcern(row.concern, representations),
    cluster:
      row.concern.processingStatus === "ready" &&
      row.cluster?.status === "ready"
        ? toConcernCluster(row.cluster)
        : null,
    viewed: row.view !== null,
    reactionCount: row.reactionCount ?? 0,
    reacted: row.reacted === 1 || row.reacted === true,
  };
}
