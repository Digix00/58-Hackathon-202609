import type { ConcernView } from "../entity/concern-view";

export interface ConcernViewRepository {
  insert(view: ConcernView): Promise<ConcernView | null>;
}
