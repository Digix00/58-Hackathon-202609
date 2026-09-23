import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import {
  ConcernProcessing,
  ConcernRepresentation,
} from "../../application/entity/concern-processing";
import type { ConcernProcessingRepository } from "../../application/repository/concern-processing.repository";
import { concernClusters, concernRepresentations, concerns } from "./schema";

/** D1 implementation of the concern processing persistence port. */
export class D1ConcernProcessingRepository
  implements ConcernProcessingRepository
{
  private readonly db: ReturnType<typeof drizzle>;

  constructor(d1: D1Database) {
    this.db = drizzle(d1);
  }

  async findState(concernId: string): Promise<ConcernProcessing | null> {
    const [row, representationRows] = await Promise.all([
      this.db
        .select({
          clusterId: concerns.clusterId,
          modelVersion: concernClusters.modelVersion,
          status: concerns.processingStatus,
          updatedAt: concerns.updatedAt,
        })
        .from(concerns)
        .leftJoin(concernClusters, eq(concerns.clusterId, concernClusters.id))
        .where(eq(concerns.id, concernId))
        .get(),
      this.db
        .select()
        .from(concernRepresentations)
        .where(eq(concernRepresentations.concernId, concernId))
        .all(),
    ]);

    if (!row) {
      return null;
    }

    return new ConcernProcessing({
      concernId,
      clusterId: row.clusterId,
      modelVersion: row.modelVersion,
      status: row.status as ConcernProcessing["status"],
      representations: representationRows.map(
        (representation) =>
          new ConcernRepresentation({
            concernId: representation.concernId,
            locale: representation.locale as ConcernRepresentation["locale"],
            body: representation.body,
            status: representation.status as ConcernRepresentation["status"],
            errorCode: representation.errorCode,
            updatedAt: representation.updatedAt,
          }),
      ),
      updatedAt: row.updatedAt,
    });
  }

  async assignCluster(
    processing: ConcernProcessing,
  ): Promise<ConcernProcessing> {
    const candidateClusterId = processing.clusterId;
    if (!candidateClusterId) {
      throw new TypeError("clusterId is required to assign a concern");
    }

    await this.db
      .insert(concernClusters)
      .values({
        id: candidateClusterId,
        label: null,
        summary: null,
        status: "pending",
        modelVersion: processing.modelVersion,
        createdAt: processing.updatedAt,
        updatedAt: processing.updatedAt,
      })
      .onConflictDoNothing()
      .run();

    await this.db
      .update(concerns)
      .set({ clusterId: candidateClusterId, updatedAt: processing.updatedAt })
      .where(
        and(eq(concerns.id, processing.concernId), isNull(concerns.clusterId)),
      )
      .run();

    const row = await this.db
      .select({ clusterId: concerns.clusterId })
      .from(concerns)
      .where(eq(concerns.id, processing.concernId))
      .get();
    if (!row?.clusterId) {
      throw new Error("Concern disappeared while assigning a cluster");
    }

    return new ConcernProcessing({
      concernId: processing.concernId,
      clusterId: row.clusterId,
      modelVersion: processing.modelVersion,
      status: processing.status,
      representations: processing.representations,
      updatedAt: processing.updatedAt,
    });
  }

  async markProcessing(processing: ConcernProcessing): Promise<void> {
    await this.db
      .update(concerns)
      .set({
        processingStatus: processing.status,
        updatedAt: processing.updatedAt,
      })
      .where(
        and(
          eq(concerns.id, processing.concernId),
          ne(concerns.processingStatus, "ready"),
        ),
      )
      .run();
  }

  async saveResult(processing: ConcernProcessing): Promise<void> {
    const updateConcern = this.db
      .update(concerns)
      .set({
        processingStatus: processing.status,
        updatedAt: processing.updatedAt,
      })
      .where(eq(concerns.id, processing.concernId));

    if (processing.representations.length === 0) {
      await updateConcern.run();
      return;
    }

    const upsertRepresentations = this.db
      .insert(concernRepresentations)
      .values(
        processing.representations.map((representation) => ({
          concernId: representation.concernId,
          locale: representation.locale,
          body: representation.body,
          status: representation.status,
          errorCode: representation.errorCode,
          updatedAt: representation.updatedAt,
        })),
      )
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
      });

    // Batch commits both statements atomically so a mid-write failure never
    // leaves representations saved with the concern status still stale.
    await this.db.batch([upsertRepresentations, updateConcern]);
  }

  async markFailed(processing: ConcernProcessing): Promise<void> {
    await this.db
      .update(concerns)
      .set({
        processingStatus: processing.status,
        updatedAt: processing.updatedAt,
      })
      .where(
        and(
          eq(concerns.id, processing.concernId),
          ne(concerns.processingStatus, "ready"),
        ),
      )
      .run();
  }
}
