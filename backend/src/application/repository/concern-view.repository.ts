import type { ConcernView } from "../entity/concern-view";
import type { LearningEvent } from "../entity/learning-event";

export interface ConcernViewRepository {
  insert(view: ConcernView, event: LearningEvent): Promise<ConcernView | null>;
}
