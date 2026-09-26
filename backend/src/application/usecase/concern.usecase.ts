import type { AgeGroup, Gender } from "../entity/concern";
import { Concern } from "../entity/concern";
import {
  type ConcernFeedCandidate,
  type ConcernSort,
  type FeedImpression,
  type RankedConcernFeedItem,
} from "../entity/feed";
import {
  CONCERN_PROCESSING_MESSAGE_TYPE,
  type ConcernProcessingQueue,
} from "../port/concern-processing-queue";
import {
  isOwnConcern,
  RECOMMENDATION_ALGORITHM_VERSION,
  rankConcernFeedCandidates,
} from "../recommendation/recommendation.policy";
import type {
  ConcernFeedCursor,
  ConcernListCursor,
  ConcernRepository,
  ListConcernFeedInput,
  ListPublishedConcernsInput,
  RecommendedConcernCursor,
} from "../repository/concern.repository";
import { deriveAgeGroup } from "../shared/age-group";
import { generateId } from "../shared/id-generator";

/** 投稿時に属性が未指定の場合のフォールバック元となる、認証済みユーザーのプロフィール。 */
export interface CreateConcernUserProfile {
  birthYear: number | null;
  birthMonth: number | null;
  gender: Gender | null;
  regionCode: string | null;
}

export interface CreateConcernInput {
  userId: string;
  body: string;
  ageGroup?: AgeGroup;
  gender?: Gender;
  regionCode?: string;
  userProfile?: CreateConcernUserProfile;
}

export interface ListFeedInput extends ListConcernFeedInput {
  sort: ConcernSort;
  recommendationCursor?: RecommendedConcernCursor;
}

export interface ListFeedResult {
  items: RankedConcernFeedItem[];
  nextCursor: ConcernFeedCursor | null;
}

export interface IConcernUseCase {
  create(input: CreateConcernInput): Promise<Concern>;
  listPublished(
    input: ListPublishedConcernsInput,
  ): Promise<ListPublishedConcernsResult>;
  findPublishedById(id: string): Promise<Concern | null>;

  listFeed?(input: ListFeedInput): Promise<ListFeedResult>;
  findPublishedFeedItem?(
    id: string,
    userId?: string,
  ): Promise<RankedConcernFeedItem | null>;
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
  private readonly processingQueue?: ConcernProcessingQueue;

  constructor(
    repository: ConcernRepository,
    now: () => Date = () => new Date(),
    createId: () => string = generateId,
    processingQueue?: ConcernProcessingQueue,
  ) {
    this.repository = repository;
    this.now = now;
    this.createId = createId;
    this.processingQueue = processingQueue;
  }

  readonly create = async (input: CreateConcernInput): Promise<Concern> => {
    const profile = input.userProfile;
    const concern = new Concern({
      id: this.createId(),
      userId: input.userId,
      body: input.body,
      ageGroup:
        input.ageGroup ??
        (profile
          ? (deriveAgeGroup(
              profile.birthYear,
              profile.birthMonth,
              this.now(),
            ) ?? undefined)
          : undefined),
      gender: input.gender ?? profile?.gender ?? undefined,
      regionCode: input.regionCode ?? profile?.regionCode ?? undefined,
      createdAt: this.now().toISOString(),
    });

    const savedConcern = await this.repository.insert(concern);
    if (this.processingQueue) {
      await this.processingQueue.enqueue({
        type: CONCERN_PROCESSING_MESSAGE_TYPE,
        concernId: savedConcern.id,
        body: savedConcern.body,
      });
    }

    return savedConcern;
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
    const sort =
      input.sort === "recommended" && !input.userId ? "newest" : input.sort;

    if (sort === "newest") {
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

  private async listRecommendedFeed(
    input: ListFeedInput,
  ): Promise<ListFeedResult> {
    const canRestorePendingCandidates = Boolean(this.repository.listFeedByIds);
    const candidateLimit = Math.min(
      canRestorePendingCandidates ? 250 : input.limit,
      Math.max(input.limit * 5, input.limit + 1),
    );
    const recommendationCursor = input.recommendationCursor;
    const sourceCursor = recommendationCursor
      ? recommendationCursor.sourceCursor
      : (input.cursor ?? null);
    let nextSourceCursor = sourceCursor;
    let candidateWindowCursor = recommendationCursor
      ? recommendationCursor.candidateWindowCursor
      : sourceCursor;
    let returnedConcernIds = recommendationCursor?.returnedConcernIds ?? [];
    let candidateWindow: ConcernFeedCandidate[] = [];
    let pendingCandidatesRestored = false;

    try {
      const pendingCandidates = await this.listPendingFeedCandidates(
        recommendationCursor?.pendingConcernIds ?? [],
        input,
      );
      pendingCandidatesRestored = true;
      candidateWindow = pendingCandidates;

      const shouldFetchCandidates =
        !recommendationCursor ||
        (pendingCandidates.length < input.limit && sourceCursor !== null);
      if (shouldFetchCandidates) {
        const candidates = await this.listFeedCandidates({
          limit: candidateLimit,
          cursor: sourceCursor ?? undefined,
          gender: input.gender,
          regionCode: input.regionCode,
          clusterId: input.clusterId,
          userId: input.userId,
        });
        candidateWindow = mergeFeedCandidates(
          pendingCandidates,
          candidates.items,
        );
        nextSourceCursor = toNextCursor(candidates.items, candidates.hasMore);
        candidateWindowCursor = sourceCursor;
        returnedConcernIds = [];
      }

      const history =
        this.repository.listRecommendationHistory && input.userId
          ? await this.repository.listRecommendationHistory(input.userId, 50)
          : [];
      const ranked = rankConcernFeedCandidates(
        candidateWindow,
        history,
        recommendationCursor?.lastClusterId,
        input.userId,
      );
      const items = ranked.slice(0, input.limit);
      const result = {
        items,
        nextCursor: toRecommendedCursor(
          ranked,
          input.limit,
          nextSourceCursor,
          candidateWindowCursor,
          returnedConcernIds,
        ),
      };
      await this.recordImpressions(input.userId ?? "", items);
      return result;
    } catch {
      const pendingConcernIds = recommendationCursor?.pendingConcernIds ?? [];
      const restorationFailed =
        pendingConcernIds.length > 0 && !pendingCandidatesRestored;
      let fallbackCandidates = candidateWindow;
      let fallbackSourceCursor = nextSourceCursor;
      let fallbackReturnedConcernIds = returnedConcernIds;
      if (fallbackCandidates.length === 0) {
        const fallback = await this.listFeedCandidates({
          limit: recommendationCursor ? candidateLimit : input.limit,
          cursor: candidateWindowCursor ?? undefined,
          gender: input.gender,
          regionCode: input.regionCode,
          clusterId: input.clusterId,
          userId: input.userId,
        });
        const returnedIds = new Set(returnedConcernIds);
        fallbackCandidates = fallback.items.filter(
          (candidate) => !returnedIds.has(candidate.concern.id),
        );
        fallbackSourceCursor = toNextCursor(fallback.items, fallback.hasMore);
        fallbackReturnedConcernIds = returnedConcernIds;
      }
      if (restorationFailed && fallbackCandidates.length === 0) {
        throw new Error("pending recommendation candidates are unavailable");
      }
      const fallbackItems = fallbackCandidates.map((candidate) =>
        toFallbackFeedItem(candidate, input.userId),
      );
      const items = fallbackItems.slice(0, input.limit);
      await this.recordImpressions(input.userId ?? "", items);
      return {
        items,
        nextCursor: toRecommendedCursor(
          fallbackItems,
          input.limit,
          fallbackSourceCursor,
          candidateWindowCursor,
          fallbackReturnedConcernIds,
          restorationFailed ? pendingConcernIds : [],
        ),
      };
    }
  }

  private async listPendingFeedCandidates(
    ids: string[],
    input: ListFeedInput,
  ): Promise<ConcernFeedCandidate[]> {
    if (ids.length === 0) {
      return [];
    }
    if (!this.repository.listFeedByIds) {
      throw new Error("recommended cursor restoration is not configured");
    }

    const candidates = await this.repository.listFeedByIds({
      ids,
      gender: input.gender,
      regionCode: input.regionCode,
      clusterId: input.clusterId,
      userId: input.userId,
    });
    const candidatesById = new Map(
      candidates.map((candidate) => [candidate.concern.id, candidate]),
    );
    return ids.flatMap((id) => {
      const candidate = candidatesById.get(id);
      return candidate ? [candidate] : [];
    });
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

/**
 * 推薦処理の失敗時に新着順で返す項目を作る。閲覧者自身の投稿は、
 * 通常の推薦と同じく own_post として識別できるようにする。
 */
function toFallbackFeedItem(
  candidate: ConcernFeedCandidate,
  userId: string | undefined,
): RankedConcernFeedItem {
  return {
    ...candidate,
    recommendation: {
      strategy: "fallback",
      reasonCode: isOwnConcern(candidate, userId)
        ? "own_post"
        : "fallback_newest",
    },
  };
}

function mergeFeedCandidates(
  pendingCandidates: ConcernFeedCandidate[],
  candidates: ConcernFeedCandidate[],
): ConcernFeedCandidate[] {
  const byConcernId = new Map<string, ConcernFeedCandidate>();
  for (const candidate of [...pendingCandidates, ...candidates]) {
    byConcernId.set(candidate.concern.id, candidate);
  }
  return [...byConcernId.values()];
}

function toRecommendedCursor(
  ranked: RankedConcernFeedItem[],
  limit: number,
  sourceCursor: ConcernListCursor | null,
  candidateWindowCursor: ConcernListCursor | null,
  returnedConcernIds: string[],
  preservedPendingConcernIds: string[] = [],
): ConcernFeedCursor | null {
  const currentPageConcernIds = ranked
    .slice(0, limit)
    .map((item) => item.concern.id);
  const allReturnedConcernIds = uniqueConcernIds([
    ...returnedConcernIds,
    ...currentPageConcernIds,
  ]);
  const returnedConcernIdSet = new Set(allReturnedConcernIds);
  const pendingConcernIds = uniqueConcernIds([
    ...preservedPendingConcernIds,
    ...ranked.slice(limit).map((item) => item.concern.id),
  ]).filter((id) => !returnedConcernIdSet.has(id));
  if (!sourceCursor && pendingConcernIds.length === 0) {
    return null;
  }
  const lastItem = ranked[Math.min(limit, ranked.length) - 1];

  return {
    type: "recommended",
    sourceCursor,
    pendingConcernIds,
    lastClusterId: lastItem?.cluster?.id ?? null,
    candidateWindowCursor,
    returnedConcernIds: allReturnedConcernIds,
  };
}

function uniqueConcernIds(ids: string[]): string[] {
  return [...new Set(ids)];
}
