import type { ConcernProcessing } from "../entity/concern-processing";

/** Persistence port for asynchronous concern processing. */
export interface ConcernProcessingRepository {
  findState(concernId: string): Promise<ConcernProcessing | null>;
  markProcessing(processing: ConcernProcessing): Promise<void>;
  saveResult(processing: ConcernProcessing): Promise<void>;
  markFailed(processing: ConcernProcessing): Promise<void>;
}
