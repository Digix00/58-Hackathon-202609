import { ConcernClusterSummary } from "../../application/entity/concern-cluster";
import type { ConcernClusterSummaryGenerator } from "../../application/port/concern-cluster-summary-generator";

/** Deterministic placeholder used when the local Worker has no AI binding. */
export class LocalConcernClusterSummaryGenerator
  implements ConcernClusterSummaryGenerator
{
  generate(): Promise<ConcernClusterSummary> {
    return Promise.resolve(
      new ConcernClusterSummary({
        label: "ローカル開発用クラスタ",
        summary: "Workers AIを呼び出さずに動作を確認しています。",
      }),
    );
  }
}
