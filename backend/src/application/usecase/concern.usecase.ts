import type { AgeGroup, Gender } from "../entity/concern";
import { Concern } from "../entity/concern";
import { ConcernView } from "../entity/concern-view";
import {
  type ConcernSort,
  type FeedImpression,
  type RankedConcernFeedItem,
} from "../entity/feed";
import {
  RECOMMENDATION_ALGORITHM_VERSION,
  rankConcernFeedCandidates,
} from "../recommendation/recommendation.policy";
import type {
  ConcernListCursor,
  ConcernRepository,
  ListConcernFeedInput,
  ListPublishedConcernsInput,
} from "../repository/concern.repository";
import { generateId } from "../shared/id-generator";

export interface CreateConcernInput {
  userId: string;
  body: string;
  ageGroup?: AgeGroup;
  gender?: Gender;
  regionCode?: string;
}

export interface ListFeedInput extends ListConcernFeedInput {
  sort: ConcernSort;
}

export interface ListFeedResult {
  items: RankedConcernFeedItem[];
  nextCursor: ConcernListCursor | null;
}

export interface MarkConcernViewedInput {
  userId: string;
  concernId: string;
}

export interface IConcernUseCase {
  create(input: CreateConcernInput): Promise<Concern>;
  listPublished(
    input: ListPublishedConcernsInput,
  ): Promise<ListPublishedConcernsResult>;
  findPublishedById(id: string): Promise<Concern | null>;

  /** #63との互換性を保つため、拡張Portは任意メンバーとして扱う。 */
  listFeed?(input: ListFeedInput): Promise<ListFeedResult>;
  findPublishedFeedItem?(
    id: string,
    userId?: string,
  ): Promise<RankedConcernFeedItem | null>;
  markViewed?(input: MarkConcernViewedInput): Promise<ConcernView | null>;
}

export interface ListPublishedConcernsResult {
  items: Concern[];
  nextCursor: ConcernListCursor | null;
}

/**
 * concern（悩み投稿）のドメインに関する処理を担当する。
 * 入力値の不変条件はConcernのコンストラクタが検証するため、ここではID/時刻を
 * 採番してEntityを組み立て、永続化を依頼するオーケストレーションに専念する。
 */
export class ConcernUseCase implements IConcernUseCase {
  private readonly repository: ConcernRepository;
  private readonly now: () => Date;
  private readonly createId: () => string;

  constructor(
    repository: ConcernRepository,
    now: () => Date = () => new Date(),
    createId: () => string = generateId,
  ) {
    this.repository = repository;
    this.now = now;
    this.createId = createId;
  }

  readonly create = async (input: CreateConcernInput): Promise<Concern> => {
    const concern = new Concern({
      id: this.createId(),
      userId: input.userId,
      body: input.body,
      ageGroup: input.ageGroup,
      gender: input.gender,
      regionCode: input.regionCode,
      createdAt: this.now().toISOString(),
    });

    return this.repository.insert(concern);
  };

  readonly listPublished = async (
    input: ListPublishedConcernsInput,
  ): Promise<ListPublishedConcernsResult> => {
    const result = await this.repository.listPublished(input);
    const lastItem = result.items[result.items.length - 1];

    return {
      items: result.items,
      nextCursor:
        result.hasMore && lastItem
          ? { createdAt: lastItem.createdAt, id: lastItem.id }
          : null,
    };
  };

  readonly findPublishedById = (id: string): Promise<Concern | null> =>
    this.repository.findPublishedById(id);

  readonly listFeed = async (input: ListFeedInput): Promise<ListFeedResult> => {
    if (input.sort === "recommended" && !input.userId) {
      throw new Error("recommended feed requires an authenticated user");
    }

    if (input.sort === "newest") {
      const result = await this.listFeedCandidates(input);
      return {
        items: result.items.map((candidate) => ({
          ...candidate,
          recommendation: {
            strategy: "newest" as const,
            reasonCode: "newest" as const,
          },
        })),
        nextCursor: toNextCursor(result.items, result.hasMore),
      };
    }

    return this.listRecommendedFeed(input);
  };

  readonly findPublishedFeedItem = async (
    id: string,
    userId?: string,
  ): Promise<RankedConcernFeedItem | null> => {
    const candidate = this.repository.findPublishedFeedCandidate
      ? await this.repository.findPublishedFeedCandidate(id, userId)
      : await this.findLegacyFeedCandidate(id);
    return candidate
      ? {
          ...candidate,
          recommendation: {
            strategy: "newest",
            reasonCode: "newest",
          },
        }
      : null;
  };

  readonly markViewed = async (
    input: MarkConcernViewedInput,
  ): Promise<ConcernView | null> => {
    const concern = await this.repository.findPublishedById(input.concernId);
    if (!concern || !this.repository.recordView) {
      return null;
    }

    const viewedAt = this.now().toISOString();
    return this.repository.recordView(
      new ConcernView({
        concernId: concern.id,
        userId: input.userId,
        firstViewedAt: viewedAt,
        lastViewedAt: viewedAt,
      }),
    );
  };

  private async listRecommendedFeed(
    input: ListFeedInput,
  ): Promise<ListFeedResult> {
    const candidateLimit = Math.min(
      250,
      Math.max(input.limit * 5, input.limit + 1),
    );
    const candidateInput: ListConcernFeedInput = {
      limit: candidateLimit,
      cursor: input.cursor,
      regionCode: input.regionCode,
      clusterId: input.clusterId,
      userId: input.userId,
    };

    try {
      const candidates = await this.listFeedCandidates(candidateInput);
      const history =
        this.repository.listRecommendationHistory && input.userId
          ? await this.repository.listRecommendationHistory(input.userId, 50)
          : [];
      const ranked = rankConcernFeedCandidates(candidates.items, history);
      const items = ranked.slice(0, input.limit);
      const result = {
        items,
        nextCursor: toNextCursor(candidates.items, candidates.hasMore),
      };
      await this.recordImpressions(input.userId ?? "", items);
      return result;
    } catch {
      const fallback = await this.listFeedCandidates({
        limit: input.limit,
        cursor: input.cursor,
        regionCode: input.regionCode,
        clusterId: input.clusterId,
        userId: input.userId,
      });
      const items = fallback.items.map((candidate) => ({
        ...candidate,
        recommendation: {
          strategy: "fallback" as const,
          reasonCode: "fallback_newest" as const,
        },
      }));
      await this.recordImpressions(input.userId ?? "", items);
      return {
        items,
        nextCursor: toNextCursor(fallback.items, fallback.hasMore),
      };
    }
  }

  private async listFeedCandidates(input: ListConcernFeedInput) {
    if (this.repository.listFeed) {
      return this.repository.listFeed(input);
    }

    const result = await this.repository.listPublished(input);
    return {
      items: result.items.map((concern) => ({
        concern,
        cluster: null,
        viewed: false,
      })),
      hasMore: result.hasMore,
    };
  }

  private async findLegacyFeedCandidate(id: string) {
    const concern = await this.repository.findPublishedById(id);
    return concern
      ? {
          concern,
          cluster: null,
          viewed: false,
        }
      : null;
  }

  private async recordImpressions(
    userId: string,
    items: RankedConcernFeedItem[],
  ): Promise<void> {
    if (!userId || !this.repository.recordFeedImpressions) {
      return;
    }

    const exposedAt = this.now().toISOString();
    const impressions: FeedImpression[] = items.map((item, position) => ({
      id: this.createId(),
      userId,
      concernId: item.concern.id,
      strategy: item.recommendation.strategy,
      reasonCode: item.recommendation.reasonCode,
      algorithmVersion: RECOMMENDATION_ALGORITHM_VERSION,
      position,
      exposedAt,
      openedAt: null,
    }));

    try {
      await this.repository.recordFeedImpressions(impressions);
    } catch {
      // 表示履歴の記録失敗で、ユーザーがフィードを読めなくならないようにする。
    }
  }
}

function toNextCursor(
  items: Array<{ concern: Concern } | Concern>,
  hasMore: boolean,
): ConcernListCursor | null {
  if (!hasMore) {
    return null;
  }

  const lastItem = items[items.length - 1];
  if (!lastItem) {
    return null;
  }

  const concern = "concern" in lastItem ? lastItem.concern : lastItem;
  return { createdAt: concern.createdAt, id: concern.id };
}
