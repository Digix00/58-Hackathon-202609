import { and, desc, eq, lt, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import {
  ConcernCluster,
  ConcernClusterSummaryClaim,
  ConcernClusterSummaryInput,
} from "../../application/entity/concern-cluster";
import type { ConcernClusterSummaryRepository } from "../../application/repository/concern-cluster-summary.repository";
import { concernClusters, concerns } from "./schema";

const CLUSTER_SUMMARY_CONCERN_LIMIT = 10;

/** D1 implementation of the cluster summary persistence port. */
export class D1ConcernClusterSummaryRepository
  implements ConcernClusterSummaryRepository
{
  private readonly db: ReturnType<typeof drizzle>;

  constructor(d1: D1Database) {
    this.db = drizzle(d1);
  }

  async claimPendingSummaryInput(
    clusterId: string,
    claimedAt: string,
    staleBefore: string,
  ): Promise<ConcernClusterSummaryClaim | null> {
    // The conditional UPDATE is the claim: only one delivery can move a
    // pending cluster to generating, while expired leases can be recovered.
    const cluster = await this.db
      .update(concernClusters)
      .set({ status: "generating", updatedAt: claimedAt })
      .where(
        and(
          eq(concernClusters.id, clusterId),
          or(
            eq(concernClusters.status, "pending"),
            and(
              eq(concernClusters.status, "generating"),
              lt(concernClusters.updatedAt, staleBefore),
            ),
          ),
        ),
      )
      .returning({ id: concernClusters.id })
      .get();

    if (!cluster) {
      const current = await this.db
        .select({ status: concernClusters.status })
        .from(concernClusters)
        .where(eq(concernClusters.id, clusterId))
        .get();

      if (current?.status === "ready") {
        return null;
      }
      if (current?.status === "generating") {
        throw new Error("Cluster summary generation is already in progress");
      }
      if (!current) {
        throw new Error("Concern cluster not found while claiming summary");
      }
      throw new Error("Pending cluster summary could not be claimed");
    }

    try {
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
        .limit(CLUSTER_SUMMARY_CONCERN_LIMIT)
        .all();

      if (rows.length === 0) {
        throw new Error("No published concerns are available for the summary");
      }

      return new ConcernClusterSummaryClaim({
        input: new ConcernClusterSummaryInput({
          clusterId: cluster.id,
          concernBodies: rows.map((row) => row.body),
        }),
        claimedAt,
      });
    } catch (error) {
      await this.releaseSummaryClaim(clusterId, claimedAt, claimedAt).catch(
        () => undefined,
      );
      throw error;
    }
  }

  async saveSummary(cluster: ConcernCluster, claimedAt: string): Promise<void> {
    if (
      cluster.status !== "ready" ||
      cluster.label === null ||
      cluster.summary === null ||
      cluster.updatedAt === null
    ) {
      throw new TypeError("a completed cluster summary is required");
    }

    const saved = await this.db
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
          eq(concernClusters.status, "generating"),
          eq(concernClusters.updatedAt, claimedAt),
        ),
      )
      .returning({ id: concernClusters.id })
      .get();

    if (!saved) {
      throw new Error("Cluster summary claim was lost before saving");
    }
  }

  async releaseSummaryClaim(
    clusterId: string,
    claimedAt: string,
    releasedAt: string,
  ): Promise<void> {
    await this.db
      .update(concernClusters)
      .set({ status: "pending", updatedAt: releasedAt })
      .where(
        and(
          eq(concernClusters.id, clusterId),
          eq(concernClusters.status, "generating"),
          eq(concernClusters.updatedAt, claimedAt),
        ),
      )
      .run();
  }
}
