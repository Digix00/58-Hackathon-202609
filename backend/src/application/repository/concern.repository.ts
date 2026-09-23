import type { Concern } from "../entity/concern";
import type {
  ConcernFeedCandidate,
  FeedImpression,
  RecommendationHistory,
} from "../entity/feed";

export interface ConcernListCursor {
  createdAt: string;
  id: string;
}

export interface RecommendedConcernCursor {
  type: "recommended";
  sourceCursor: ConcernListCursor | null;
  pendingConcernIds: string[];
}

export type ConcernFeedCursor = ConcernListCursor | RecommendedConcernCursor;

export interface ListPublishedConcernsInput {
  limit: number;
  cursor?: ConcernListCursor;
}

export interface ListPublishedConcernsResult {
  items: Concern[];
  hasMore: boolean;
}

export interface ListConcernFeedInput extends ListPublishedConcernsInput {
  regionCode?: string;
  clusterId?: string;
  userId?: string;
}

export interface ListConcernFeedResult {
  items: ConcernFeedCandidate[];
  hasMore: boolean;
}

export interface ListConcernFeedByIdsInput {
  ids: string[];
  regionCode?: string;
  clusterId?: string;
  userId?: string;
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

  /** #74で利用する拡張Port。旧来の投稿取得Portとの互換性のため任意実装とする。 */
  listFeed?(input: ListConcernFeedInput): Promise<ListConcernFeedResult>;
  listFeedByIds?(
    input: ListConcernFeedByIdsInput,
  ): Promise<ConcernFeedCandidate[]>;
  findPublishedFeedCandidate?(
    id: string,
    userId?: string,
  ): Promise<ConcernFeedCandidate | null>;
  listRecommendationHistory?(
    userId: string,
    limit: number,
  ): Promise<RecommendationHistory[]>;
  recordFeedImpressions?(impressions: FeedImpression[]): Promise<void>;
}
