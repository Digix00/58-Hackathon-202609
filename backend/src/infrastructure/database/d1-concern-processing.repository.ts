import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import type { ConcernProcessingStatus } from "../../application/entity/concern";
import type {
  ConcernProcessingRepository,
  ConcernProcessingRepresentations,
  ConcernProcessingState,
} from "../../application/repository/concern-processing.repository";
import { concernClusters, concernRepresentations, concerns } from "./schema";

/** D1 implementation for the concern-processing persistence port. */
export class D1ConcernProcessingRepository
  implements ConcernProcessingRepository
{
  private readonly db: ReturnType<typeof drizzle>;

  constructor(d1: D1Database) {
    this.db = drizzle(d1);
  }

  async findState(concernId: string): Promise<ConcernProcessingState | null> {
    const row = await this.db
      .select({
        clusterId: concerns.clusterId,
        status: concerns.processingStatus,
      })
      .from(concerns)
      .where(eq(concerns.id, concernId))
      .get();

    return row
      ? {
          clusterId: row.clusterId,
          status: row.status as ConcernProcessingStatus,
        }
      : null;
  }

  async markProcessing(concernId: string, updatedAt: string): Promise<void> {
    await this.db
      .update(concerns)
      .set({ processingStatus: "processing", updatedAt })
      .where(
        and(eq(concerns.id, concernId), ne(concerns.processingStatus, "ready")),
      )
      .run();
  }

  async assignCluster(
    concernId: string,
    candidateClusterId: string,
    modelVersion: string,
    updatedAt: string,
  ): Promise<string> {
    await this.db
      .insert(concernClusters)
      .values({
        id: candidateClusterId,
        label: null,
        summary: null,
        status: "pending",
        modelVersion,
        createdAt: updatedAt,
        updatedAt,
      })
      .onConflictDoNothing()
      .run();

    await this.db
      .update(concerns)
      .set({ clusterId: candidateClusterId, updatedAt })
      .where(and(eq(concerns.id, concernId), isNull(concerns.clusterId)))
      .run();

    const row = await this.db
      .select({ clusterId: concerns.clusterId })
      .from(concerns)
      .where(eq(concerns.id, concernId))
      .get();
    if (!row?.clusterId) {
      throw new Error("Concern disappeared while assigning a cluster");
    }

    return row.clusterId;
  }

  async saveResult(
    concernId: string,
    representations: ConcernProcessingRepresentations,
    updatedAt: string,
  ): Promise<void> {
    await this.db
      .insert(concernRepresentations)
      .values([
        {
          concernId,
          locale: "ja-Hira",
          body: representations.jaHira,
          status: "ready",
          updatedAt,
        },
        {
          concernId,
          locale: "en",
          body: representations.en,
          status: "ready",
          updatedAt,
        },
      ])
      .onConflictDoUpdate({
        target: [
          concernRepresentations.concernId,
          concernRepresentations.locale,
        ],
        set: {
          body: sql.raw("excluded.body"),
          status: sql.raw("excluded.status"),
          errorCode: sql.raw("excluded.error_code"),
          updatedAt: sql.raw("excluded.updated_at"),
        },
      })
      .run();

    await this.db
      .update(concerns)
      .set({ processingStatus: "ready", updatedAt })
      .where(eq(concerns.id, concernId))
      .run();
  }

  async markFailed(concernId: string, updatedAt: string): Promise<void> {
    await this.db
      .update(concerns)
      .set({ processingStatus: "failed", updatedAt })
      .where(
        and(eq(concerns.id, concernId), ne(concerns.processingStatus, "ready")),
      )
      .run();
  }
}
