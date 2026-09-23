import type { Concern } from "../entity/concern";

export interface ConcernListCursor {
  createdAt: string;
  id: string;
}

export interface ListPublishedConcernsInput {
  limit: number;
  cursor?: ConcernListCursor;
}

export interface ListPublishedConcernsResult {
  items: Concern[];
  hasMore: boolean;
}

/**
 * Application層が必要とする永続化処理のPort。
 * 実装の詳細（D1やDrizzle）をApplication層へ持ち込まない。
 */
export interface ConcernRepository {
  insert(concern: Concern): Promise<Concern>;
  listPublished(
    input: ListPublishedConcernsInput,
  ): Promise<ListPublishedConcernsResult>;
  findPublishedById(id: string): Promise<Concern | null>;
}
