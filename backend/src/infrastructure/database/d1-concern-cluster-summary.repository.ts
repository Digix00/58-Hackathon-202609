import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import {
  CONCERN_CLUSTER_SUMMARY_INPUT_LIMIT,
  ConcernCluster,
  ConcernClusterSummaryInput,
} from "../../application/entity/concern-cluster";
import type { ConcernClusterSummaryRepository } from "../../application/repository/concern-cluster-summary.repository";
import { concernClusters, concerns } from "./schema";

/** D1 implementation of the cluster summary persistence port. */
export class D1ConcernClusterSummaryRepository
  implements ConcernClusterSummaryRepository
{
  private readonly db: ReturnType<typeof drizzle>;

  constructor(d1: D1Database) {
    this.db = drizzle(d1);
  }

  async findPendingSummaryInput(
    clusterId: string,
  ): Promise<ConcernClusterSummaryInput | null> {
    const cluster = await this.db
      .select({ id: concernClusters.id })
      .from(concernClusters)
      .where(
        and(
          eq(concernClusters.id, clusterId),
          eq(concernClusters.status, "pending"),
        ),
      )
      .get();

    if (!cluster) {
      return null;
    }

    const rows = await this.db
      .select({ body: concerns.body })
      .from(concerns)
      .where(
        and(
          eq(concerns.clusterId, clusterId),
          eq(concerns.visibilityStatus, "published"),
        ),
      )
      .orderBy(desc(concerns.createdAt), desc(concerns.id))
      .limit(CONCERN_CLUSTER_SUMMARY_INPUT_LIMIT)
      .all();

    if (rows.length === 0) {
      return null;
    }

    return new ConcernClusterSummaryInput({
      clusterId: cluster.id,
      concernBodies: rows.map((row) => row.body),
    });
  }

  async saveSummary(cluster: ConcernCluster): Promise<void> {
    if (
      cluster.status !== "ready" ||
      cluster.label === null ||
      cluster.summary === null ||
      cluster.updatedAt === null
    ) {
      throw new TypeError("a completed cluster summary is required");
    }

    // The pending-state predicate prevents a slow duplicate job from replacing
    // a summary that another Queue delivery has already completed.
    await this.db
      .update(concernClusters)
      .set({
        label: cluster.label,
        summary: cluster.summary,
        status: cluster.status,
        updatedAt: cluster.updatedAt,
      })
      .where(
        and(
          eq(concernClusters.id, cluster.id),
          eq(concernClusters.status, "pending"),
        ),
      )
      .run();
  }
}
