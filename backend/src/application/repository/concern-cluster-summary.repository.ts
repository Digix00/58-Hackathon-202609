import type {
  ConcernCluster,
  ConcernClusterSummaryInput,
} from "../entity/concern-cluster";

/** Persistence port used to generate and save a pending cluster summary. */
export interface ConcernClusterSummaryRepository {
  findPendingSummaryInput(
    clusterId: string,
  ): Promise<ConcernClusterSummaryInput | null>;
  saveSummary(cluster: ConcernCluster): Promise<void>;
}
