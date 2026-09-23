import type {
  ConcernFeedCandidate,
  RankedConcernFeedItem,
  RecommendationHistory,
} from "../entity/feed";

/** 推薦アルゴリズムのバージョン。表示履歴を後から評価できるように保存する。 */
export const RECOMMENDATION_ALGORITHM_VERSION = "v2";

/**
 * 新着順で取得した候補を、既読状況・クラスタ・都道府県の分散で並べ替える。
 * 未読候補や閲覧履歴にないクラスタを優先しつつ、直前と同じクラスタが連続しないように
 * 候補を1件ずつ選出する。異なるクラスタが残っていない場合は、同じクラスタも選出する。
 * AIや個人情報には依存せず、同じ候補と履歴なら同じ結果になる決定的な処理とする。
 */
export function rankConcernFeedCandidates(
  candidates: ConcernFeedCandidate[],
  history: RecommendationHistory[],
  previousClusterId?: string | null,
): RankedConcernFeedItem[] {
  const viewedClusterIds = new Set(
    history.flatMap((entry) => (entry.clusterId ? [entry.clusterId] : [])),
  );
  const viewedRegionCodes = new Set(
    history.flatMap((entry) => (entry.regionCode ? [entry.regionCode] : [])),
  );
  const remaining = candidates.map((candidate, index) => ({
    candidate,
    originalIndex: index,
  }));
  const selectedClusterIds = new Set<string>();
  const selectedRegionCodes = new Set<string>();
  const ranked: RankedConcernFeedItem[] = [];
  let lastSelectedClusterId = previousClusterId ?? null;

  while (remaining.length > 0) {
    const selectable = lastSelectedClusterId
      ? remaining.filter(
          ({ candidate }) => candidate.cluster?.id !== lastSelectedClusterId,
        )
      : remaining;
    const rankingPool = selectable.length > 0 ? selectable : remaining;

    rankingPool.sort((left, right) => {
      const scoreDifference =
        scoreCandidate(
          right.candidate,
          viewedClusterIds,
          viewedRegionCodes,
          selectedClusterIds,
          selectedRegionCodes,
        ) -
        scoreCandidate(
          left.candidate,
          viewedClusterIds,
          viewedRegionCodes,
          selectedClusterIds,
          selectedRegionCodes,
        );
      if (scoreDifference !== 0) {
        return scoreDifference;
      }

      const createdAtDifference =
        right.candidate.concern.createdAt.localeCompare(
          left.candidate.concern.createdAt,
        );
      if (createdAtDifference !== 0) {
        return createdAtDifference;
      }

      const idDifference = right.candidate.concern.id.localeCompare(
        left.candidate.concern.id,
      );
      return idDifference !== 0
        ? idDifference
        : left.originalIndex - right.originalIndex;
    });

    const next = rankingPool[0];
    if (!next) {
      break;
    }
    const nextIndex = remaining.indexOf(next);
    remaining.splice(nextIndex, 1);

    const { candidate } = next;
    const clusterId = candidate.cluster?.id;
    const regionCode = candidate.concern.regionCode;
    const reasonCode = getReasonCode(
      candidate,
      viewedClusterIds,
      viewedRegionCodes,
      {
        selectedClusterIds,
        selectedRegionCodes,
      },
    );
    ranked.push({
      ...candidate,
      recommendation: {
        strategy: "recommended",
        reasonCode,
      },
    });

    if (clusterId) {
      selectedClusterIds.add(clusterId);
    }
    if (regionCode) {
      selectedRegionCodes.add(regionCode);
    }
    lastSelectedClusterId = clusterId ?? null;
  }

  return ranked;
}

/**
 * 候補の推薦スコアを計算する。未読（クラスタあり1,000点、なし100点）、
 * 閲覧履歴にないクラスタ（250点）、今回のページで未選択のクラスタ（75点）、
 * 都道府県の分散（65点、既読地域なら25点）を加点し、選出順を決める。
 */
function scoreCandidate(
  candidate: ConcernFeedCandidate,
  viewedClusterIds: Set<string>,
  viewedRegionCodes: Set<string>,
  selectedClusterIds: Set<string>,
  selectedRegionCodes: Set<string>,
): number {
  const clusterId = candidate.cluster?.id;
  const regionCode = candidate.concern.regionCode;
  let score = 0;

  if (!candidate.viewed) {
    score += clusterId ? 1_000 : 100;
  }
  if (clusterId && !viewedClusterIds.has(clusterId)) {
    score += 250;
  }
  if (clusterId && !selectedClusterIds.has(clusterId)) {
    score += 75;
  }
  if (regionCode && !selectedRegionCodes.has(regionCode)) {
    score += viewedRegionCodes.has(regionCode) ? 25 : 65;
  }

  return score;
}

/**
 * 候補を選出した理由をレスポンス用のコードに変換する。
 * 未読クラスタ、未閲覧クラスタ、都道府県の分散、クラスタの分散の順に判定し、
 * いずれにも該当しない場合は新着順として扱う。
 */
function getReasonCode(
  candidate: ConcernFeedCandidate,
  viewedClusterIds: Set<string>,
  viewedRegionCodes: Set<string>,
  selected: {
    selectedClusterIds: Set<string>;
    selectedRegionCodes: Set<string>;
  },
) {
  const clusterId = candidate.cluster?.id;
  const regionCode = candidate.concern.regionCode;

  if (!candidate.viewed && clusterId) {
    return "unread_cluster" as const;
  }
  if (clusterId && !viewedClusterIds.has(clusterId)) {
    return "new_cluster" as const;
  }
  if (
    regionCode &&
    !selected.selectedRegionCodes.has(regionCode) &&
    !viewedRegionCodes.has(regionCode)
  ) {
    return "region_diversity" as const;
  }
  if (clusterId && !selected.selectedClusterIds.has(clusterId)) {
    return "new_cluster" as const;
  }
  return "newest" as const;
}
