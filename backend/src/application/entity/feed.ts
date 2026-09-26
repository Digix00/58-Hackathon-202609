import type { Concern } from "./concern";
import type { ConcernCluster } from "./concern-cluster";

export const CONCERN_SORT_OPTIONS = ["newest", "recommended"] as const;
export type ConcernSort = (typeof CONCERN_SORT_OPTIONS)[number];

export const RECOMMENDATION_STRATEGIES = [
  "newest",
  "recommended",
  "fallback",
] as const;
export type RecommendationStrategy = (typeof RECOMMENDATION_STRATEGIES)[number];

export const RECOMMENDATION_REASON_CODES = [
  "familiar_theme",
  "discovery",
  "less_heard",
  "unread_cluster",
  "new_cluster",
  "region_diversity",
  "newest",
  "fallback_newest",
] as const;
export type RecommendationReasonCode =
  (typeof RECOMMENDATION_REASON_CODES)[number];

export interface ConcernFeedCandidate {
  concern: Concern;
  cluster: ConcernCluster | null;
  viewed: boolean;
  /** 実際に表示したログイン済み利用者数。投稿者自身を除き、公開APIには返さない。 */
  readerCount?: number;
  reactionCount?: number;
  reacted?: boolean;
}

export interface RecommendationHistory {
  clusterId: string | null;
  regionCode: string | null;
  viewedAt: string;
}

export interface FeedRecommendation {
  strategy: RecommendationStrategy;
  reasonCode: RecommendationReasonCode;
}

export interface RankedConcernFeedItem extends ConcernFeedCandidate {
  recommendation: FeedRecommendation;
}

export interface FeedImpression {
  id: string;
  userId: string;
  concernId: string;
  strategy: RecommendationStrategy;
  reasonCode: RecommendationReasonCode;
  algorithmVersion: string;
  position: number;
  exposedAt: string;
  openedAt?: string | null;
}
