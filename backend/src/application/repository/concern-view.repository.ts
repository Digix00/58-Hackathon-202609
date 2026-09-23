import type { ConcernView } from "../entity/concern-view";

export interface ConcernViewRepository {
  recordForPublishedConcern(view: ConcernView): Promise<ConcernView | null>;
}
