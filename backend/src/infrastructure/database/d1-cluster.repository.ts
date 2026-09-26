import { and, asc, count, eq, gt, isNotNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import {
  type ClusterCatalogQuery,
  PublishedConcernCluster,
} from "../../application/entity/cluster-catalog";
import type { ClusterRepository } from "../../application/repository/cluster.repository";
import { concernClusters, concerns } from "./schema";

export class D1ClusterRepository implements ClusterRepository {
  private readonly db: ReturnType<typeof drizzle>;

  constructor(d1: D1Database) {
    this.db = drizzle(d1);
  }

  async listPublished(query: ClusterCatalogQuery) {
    const conditions = [
      eq(concernClusters.status, "ready"),
      isNotNull(concernClusters.label),
      isNotNull(concernClusters.summary),
      sql`trim(${concernClusters.label}) <> ''`,
      sql`trim(${concernClusters.summary}) <> ''`,
      eq(concerns.visibilityStatus, "published"),
      eq(concerns.processingStatus, "ready"),
    ];
    if (query.afterId) conditions.push(gt(concernClusters.id, query.afterId));
    if (query.clusterId)
      conditions.push(eq(concernClusters.id, query.clusterId));
    if (query.regionCode)
      conditions.push(eq(concerns.regionCode, query.regionCode));
    if (query.gender) conditions.push(eq(concerns.genderCode, query.gender));

    const rows = await this.db
      .select({ cluster: concernClusters, concernCount: count(concerns.id) })
      .from(concernClusters)
      .innerJoin(concerns, eq(concerns.clusterId, concernClusters.id))
      .where(and(...conditions))
      .groupBy(concernClusters.id)
      .orderBy(asc(concernClusters.id))
      .limit(query.limit + 1)
      .all();

    return {
      items: rows
        .slice(0, query.limit)
        .map(
          ({ cluster, concernCount }) =>
            new PublishedConcernCluster(cluster, concernCount),
        ),
      hasMore: rows.length > query.limit,
    };
  }
}
