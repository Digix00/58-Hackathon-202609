import type { ConcernView } from "../entity/concern-view";
import type { LearningEvent } from "../entity/learning-event";

export interface ConcernViewRepository {
  /**
   * 既読を一度だけ記録する。あわせて、その投稿を推薦で表示した履歴のうち
   * 未開封のものを開封済みにする（推薦の評価に使う）。
   */
  insert(view: ConcernView, event: LearningEvent): Promise<ConcernView | null>;
}
