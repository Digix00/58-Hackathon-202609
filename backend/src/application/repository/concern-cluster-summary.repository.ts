import type {
  ConcernCluster,
  ConcernClusterSummaryClaim,
} from "../entity/concern-cluster";

/** A concurrent delivery currently owns, or already replaced, this claim. */
export class ConcernClusterSummaryClaimConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConcernClusterSummaryClaimConflictError";
  }
}

/** Persistence port used to generate and save a pending cluster summary. */
export interface ConcernClusterSummaryRepository {
  claimPendingSummaryInput(
    clusterId: string,
    claimedAt: string,
    staleBefore: string,
  ): Promise<ConcernClusterSummaryClaim | null>;
  saveSummary(cluster: ConcernCluster, claimedAt: string): Promise<void>;
  releaseSummaryClaim(
    clusterId: string,
    claimedAt: string,
    releasedAt: string,
  ): Promise<void>;
}
