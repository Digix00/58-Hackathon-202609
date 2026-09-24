import type {
  ConcernClusterSummary,
  ConcernClusterSummaryInput,
} from "../entity/concern-cluster";

/** Generates safe display text from the public concerns in one pending cluster. */
export interface ConcernClusterSummaryGenerator {
  generate(input: ConcernClusterSummaryInput): Promise<ConcernClusterSummary>;
}
