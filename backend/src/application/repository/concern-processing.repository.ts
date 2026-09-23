import type { ConcernProcessingStatus } from "../entity/concern";

export interface ConcernProcessingState {
  clusterId: string | null;
  status: ConcernProcessingStatus;
}

export interface ConcernProcessingRepresentations {
  jaHira: string;
  en: string;
}

/** Persists progress and derived concern data independently of the AI provider. */
export interface ConcernProcessingRepository {
  findState(concernId: string): Promise<ConcernProcessingState | null>;
  markProcessing(concernId: string, updatedAt: string): Promise<void>;
  assignCluster(
    concernId: string,
    candidateClusterId: string,
    modelVersion: string,
    updatedAt: string,
  ): Promise<string>;
  saveResult(
    concernId: string,
    representations: ConcernProcessingRepresentations,
    updatedAt: string,
  ): Promise<void>;
  markFailed(concernId: string, updatedAt: string): Promise<void>;
}
