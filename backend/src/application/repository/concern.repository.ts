import type { Concern } from "../entity/concern";

/**
 * Application層が必要とする永続化処理のPort。
 * 実装の詳細（D1やDrizzle）をApplication層へ持ち込まない。
 */
export interface ConcernRepository {
  insert(concern: Concern): Promise<Concern>;
}
