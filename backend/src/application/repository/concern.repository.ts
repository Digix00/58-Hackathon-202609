import type { Concern, Gender } from "../entity/concern";
import type {
  ConcernFeedCandidate,
  FeedImpression,
  RecommendationHistory,
} from "../entity/feed";

/** 投稿の属性が未指定の場合に、insert時のフォールバック元となる認証済みユーザーのプロフィール。 */
export interface CreateConcernUserProfile {
  birthYear: number | null;
  birthMonth: number | null;
  gender: Gender | null;
  regionCode: string | null;
}

export interface ConcernListCursor {
  createdAt: string;
  id: string;
}

export interface RecommendedConcernCursor {
  type: "recommended";
  sourceCursor: ConcernListCursor | null;
  pendingConcernIds: string[];
  lastClusterId: string | null;
  candidateWindowCursor: ConcernListCursor | null;
  returnedConcernIds: string[];
}

export type ConcernFeedCursor = ConcernListCursor | RecommendedConcernCursor;

export interface ListPublishedConcernsInput {
  limit: number;
  cursor?: ConcernListCursor;
  excludeUserId?: string;
  gender?: string;
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
  gender?: string;
  regionCode?: string;
  clusterId?: string;
  userId?: string;
  excludeUserId?: string;
}

/**
 * Application層が必要とする永続化処理のPort。
 * 実装の詳細（D1やDrizzle）をApplication層へ持ち込まない。
 */
export interface ConcernRepository {
  /**
   * concernを永続化する。userProfileはageGroup/gender/regionCodeが未指定のときの
   * フォールバック元。優先順位の判断（明示指定を優先する）は実装側が担う。
   */
  insert(
    concern: Concern,
    userProfile?: CreateConcernUserProfile,
  ): Promise<Concern>;
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
