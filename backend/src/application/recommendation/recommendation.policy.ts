import type {
  ConcernFeedCandidate,
  RankedConcernFeedItem,
  RecommendationHistory,
  RecommendationReasonCode,
} from "../entity/feed";
import { getRegionArea } from "../entity/region-code";

/** 推薦アルゴリズムのバージョン。表示履歴を後から評価できるように保存する。 */
export const RECOMMENDATION_ALGORITHM_VERSION = "v4";

/**
 * 推薦スコアの重みとページ内の上限。値を変えたらアルゴリズムのバージョンも上げ、
 * feed_impressions でバージョンごとの開封率を比較できるようにする。
 */
export const RECOMMENDATION_WEIGHTS = {
  /** 未読（クラスタあり／なし）。 */
  unreadClustered: 1_000,
  unreadUnclustered: 100,
  /** 閲覧履歴にないクラスタ。 */
  unseenCluster: 250,
  /** 今回のページでまだ選んでいないクラスタ。 */
  clusterNotInPage: 75,
  /** 都道府県の分散（未読地域／既読地域）。 */
  regionNotInPage: 65,
  viewedRegionNotInPage: 25,
  /** 今回のページでまだ選んでいない年代。 */
  ageGroupNotInPage: 40,
  /** 閲覧者と同じ都道府県／同じ地方区分。ページ内の上限までだけ加点する。 */
  nearbyPrefecture: 200,
  nearbyArea: 100,
  /** 直近の閲覧履歴に占めるクラスタの割合（0〜1）に掛けて減点する。 */
  clusterHistoryShare: 300,
  /** ページ内の同一クラスタ上限に達した候補の減点。 */
  clusterOverPageCap: 400,
  /** 新しさの最大加点と、加点が半分になるまでの時間。 */
  freshness: 150,
  freshnessHalfLifeHours: 24,
  /** 利用者と日付で決まる小さなゆらぎの最大値。 */
  dailyJitter: 40,
  /** 1ページのうち「近く」として加点する割合と、同一クラスタの割合。 */
  nearbyPageShare: 0.3,
  clusterPageShare: 0.2,
} as const;

export interface RankConcernFeedOptions {
  /** 前ページの最後のクラスタ。ページをまたいで同じクラスタの連続を避ける。 */
  previousClusterId?: string | null;
  /** 閲覧者のユーザーID。日替わりのゆらぎに使う。 */
  viewerUserId?: string;
  /** 閲覧者のプロフィール上の都道府県。未設定なら「近く」の加点をしない。 */
  viewerRegionCode?: string | null;
  /** 1ページの件数。ページ内の上限はこの件数ごとに数え直す。 */
  pageSize?: number;
  /** 新しさと日替わりのゆらぎの基準時刻。未指定なら両方とも使わない。 */
  now?: Date;
}

interface RankingEntry {
  candidate: ConcernFeedCandidate;
  unread: boolean;
  nearby: "prefecture" | "area" | null;
  baseScore: number;
  originalIndex: number;
}

interface PageState {
  clusterCounts: Map<string, number>;
  regionCodes: Set<string>;
  ageGroups: Set<string>;
  nearbyCount: number;
}

/**
 * 新着順で取得した候補を、飽きさせず特定の分野に偏らないように並べ替える。
 *
 * - 未読、閲覧履歴にないクラスタ、都道府県・年代の分散を加点する
 * - 閲覧者の近く（同じ都道府県・地方）の悩みを、1ページの一定割合まで加点する
 * - 直近の閲覧でよく読んだクラスタと、ページ内で上限に達したクラスタを減点する
 * - 新しい投稿と日替わりのゆらぎを加点し、同じ並びが続かないようにする
 * - 直前と同じクラスタは、異なるクラスタが残っている限り連続させない
 *
 * AIには依存せず、同じ入力なら同じ結果になる決定的な処理とする。
 */
export function rankConcernFeedCandidates(
  candidates: ConcernFeedCandidate[],
  history: RecommendationHistory[],
  options: RankConcernFeedOptions = {},
): RankedConcernFeedItem[] {
  const weights = RECOMMENDATION_WEIGHTS;
  const pageSize = Math.max(1, options.pageSize ?? candidates.length);
  const nearbyPageCap = Math.max(
    1,
    Math.floor(pageSize * weights.nearbyPageShare),
  );
  const clusterPageCap = Math.max(
    1,
    Math.ceil(pageSize * weights.clusterPageShare),
  );
  const viewerRegionCode = options.viewerRegionCode ?? null;
  const viewerArea = getRegionArea(viewerRegionCode);
  const viewedRegionCodes = new Set(
    history.flatMap((entry) => (entry.regionCode ? [entry.regionCode] : [])),
  );
  const clusterHistoryCounts = countBy(
    history.flatMap((entry) => (entry.clusterId ? [entry.clusterId] : [])),
  );
  const jitterSeed =
    options.viewerUserId && options.now
      ? `${options.viewerUserId}:${toJstDate(options.now)}`
      : null;

  const remaining: RankingEntry[] = candidates.map((candidate, index) => {
    const unread = !candidate.viewed;
    const regionCode = candidate.concern.regionCode;
    const nearby =
      viewerRegionCode && regionCode === viewerRegionCode
        ? ("prefecture" as const)
        : viewerArea && getRegionArea(regionCode) === viewerArea
          ? ("area" as const)
          : null;
    const clusterId = candidate.cluster?.id;
    let baseScore = 0;

    if (unread) {
      baseScore += clusterId
        ? weights.unreadClustered
        : weights.unreadUnclustered;
    }
    if (clusterId) {
      const viewedCount = clusterHistoryCounts.get(clusterId) ?? 0;
      baseScore +=
        viewedCount === 0
          ? weights.unseenCluster
          : -weights.clusterHistoryShare * (viewedCount / history.length);
    }
    if (options.now) {
      baseScore += freshnessScore(candidate.concern.createdAt, options.now);
    }
    if (jitterSeed) {
      baseScore +=
        hashToUnitInterval(`${jitterSeed}:${candidate.concern.id}`) *
        weights.dailyJitter;
    }

    return { candidate, unread, nearby, baseScore, originalIndex: index };
  });

  const ranked: RankedConcernFeedItem[] = [];
  let page = createPageState();
  let lastSelectedClusterId = options.previousClusterId ?? null;

  while (remaining.length > 0) {
    if (ranked.length > 0 && ranked.length % pageSize === 0) {
      page = createPageState();
    }
    const nearbyAvailable = page.nearbyCount < nearbyPageCap;
    const selectable = lastSelectedClusterId
      ? remaining.filter(
          ({ candidate }) => candidate.cluster?.id !== lastSelectedClusterId,
        )
      : remaining;
    const rankingPool = selectable.length > 0 ? selectable : remaining;

    let best: RankingEntry | undefined;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const entry of rankingPool) {
      const score =
        entry.baseScore +
        pageScore(entry, page, viewedRegionCodes, {
          nearbyAvailable,
          clusterPageCap,
        });
      if (
        !best ||
        score > bestScore ||
        (score === bestScore && isBefore(entry, best))
      ) {
        best = entry;
        bestScore = score;
      }
    }
    if (!best) {
      break;
    }
    remaining.splice(remaining.indexOf(best), 1);

    const { candidate } = best;
    const clusterId = candidate.cluster?.id;
    const regionCode = candidate.concern.regionCode;
    const ageGroup = candidate.concern.ageGroup;
    const nearbyApplied = best.nearby !== null && nearbyAvailable;
    ranked.push({
      ...candidate,
      recommendation: {
        strategy: "recommended",
        reasonCode: getReasonCode(best, page, {
          clusterHistoryCounts,
          nearbyApplied,
        }),
      },
    });

    if (clusterId) {
      page.clusterCounts.set(
        clusterId,
        (page.clusterCounts.get(clusterId) ?? 0) + 1,
      );
    }
    if (regionCode) {
      page.regionCodes.add(regionCode);
    }
    if (ageGroup) {
      page.ageGroups.add(ageGroup);
    }
    if (nearbyApplied) {
      page.nearbyCount += 1;
    }
    lastSelectedClusterId = clusterId ?? null;
  }

  return ranked;
}

function createPageState(): PageState {
  return {
    clusterCounts: new Map(),
    regionCodes: new Set(),
    ageGroups: new Set(),
    nearbyCount: 0,
  };
}

/** ページ内ですでに選んだ候補との重なりに応じた加減点を計算する。 */
function pageScore(
  entry: RankingEntry,
  page: PageState,
  viewedRegionCodes: Set<string>,
  limits: { nearbyAvailable: boolean; clusterPageCap: number },
): number {
  const weights = RECOMMENDATION_WEIGHTS;
  const clusterId = entry.candidate.cluster?.id;
  const regionCode = entry.candidate.concern.regionCode;
  const ageGroup = entry.candidate.concern.ageGroup;
  let score = 0;

  if (clusterId) {
    const selectedCount = page.clusterCounts.get(clusterId) ?? 0;
    if (selectedCount === 0) {
      score += weights.clusterNotInPage;
    } else if (selectedCount >= limits.clusterPageCap) {
      score -= weights.clusterOverPageCap;
    }
  }
  if (regionCode && !page.regionCodes.has(regionCode)) {
    score += viewedRegionCodes.has(regionCode)
      ? weights.viewedRegionNotInPage
      : weights.regionNotInPage;
  }
  if (ageGroup && !page.ageGroups.has(ageGroup)) {
    score += weights.ageGroupNotInPage;
  }
  if (limits.nearbyAvailable && entry.nearby === "prefecture") {
    score += weights.nearbyPrefecture;
  } else if (limits.nearbyAvailable && entry.nearby === "area") {
    score += weights.nearbyArea;
  }

  return score;
}

/**
 * 候補を選出した理由をレスポンス用のコードに変換する。
 * 近くの悩み、未読クラスタ、未閲覧クラスタ、都道府県の分散、クラスタの分散、
 * 年代の分散の順に判定し、いずれにも該当しない場合は新着順として扱う。
 * 分散の判定はページ内の加点（pageScore）と同じ条件にそろえ、加点で選ばれた
 * 候補に実際と異なる理由を示さないようにする。
 */
function getReasonCode(
  entry: RankingEntry,
  page: PageState,
  context: {
    clusterHistoryCounts: Map<string, number>;
    nearbyApplied: boolean;
  },
): RecommendationReasonCode {
  const clusterId = entry.candidate.cluster?.id;
  const regionCode = entry.candidate.concern.regionCode;
  const ageGroup = entry.candidate.concern.ageGroup;

  if (context.nearbyApplied) {
    return entry.nearby === "prefecture" ? "nearby_prefecture" : "nearby_area";
  }
  if (entry.unread && clusterId) {
    return "unread_cluster";
  }
  if (clusterId && !context.clusterHistoryCounts.has(clusterId)) {
    return "new_cluster";
  }
  if (regionCode && !page.regionCodes.has(regionCode)) {
    return "region_diversity";
  }
  if (clusterId && !page.clusterCounts.has(clusterId)) {
    return "new_cluster";
  }
  if (ageGroup && !page.ageGroups.has(ageGroup)) {
    return "age_diversity";
  }
  return "newest";
}

/** 同点のときは新しい投稿、ID降順、元の順の順で優先する。 */
function isBefore(left: RankingEntry, right: RankingEntry): boolean {
  const createdAtDifference = left.candidate.concern.createdAt.localeCompare(
    right.candidate.concern.createdAt,
  );
  if (createdAtDifference !== 0) {
    return createdAtDifference > 0;
  }
  const idDifference = left.candidate.concern.id.localeCompare(
    right.candidate.concern.id,
  );
  if (idDifference !== 0) {
    return idDifference > 0;
  }
  return left.originalIndex < right.originalIndex;
}

/** 投稿からの経過時間に応じて半減する、新しさの加点を返す。 */
function freshnessScore(createdAt: string, now: Date): number {
  const createdAtMs = Date.parse(createdAt);
  if (Number.isNaN(createdAtMs)) {
    return 0;
  }
  const ageHours = Math.max(0, (now.getTime() - createdAtMs) / 3_600_000);
  return (
    RECOMMENDATION_WEIGHTS.freshness *
    0.5 ** (ageHours / RECOMMENDATION_WEIGHTS.freshnessHalfLifeHours)
  );
}

/** 文字列から0以上1未満の決定的な値を作る（FNV-1a）。暗号用途には使わない。 */
function hashToUnitInterval(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) / 0x1_0000_0000;
}

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 日替わりのゆらぎを日本時間の0時で切り替えるため、JSTの日付を返す。 */
function toJstDate(now: Date): string {
  return new Date(now.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

function countBy(values: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}
