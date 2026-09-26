import type {
  ConcernFeedCandidate,
  RankedConcernFeedItem,
  RecommendationHistory,
  RecommendationReasonCode,
} from "../entity/feed";

/** 推薦の意味とカーソルの互換性を識別する。 */
export const RECOMMENDATION_ALGORITHM_VERSION = "v3";
export const RECOMMENDATION_CYCLE_LENGTH = 3;

/**
 * 身近なテーマ、未知のテーマ、届く機会の少ない声を順に選ぶ。
 * 分類や属性の入力状況では未読の重みを変えず、同じ候補・履歴なら同じ結果にする。
 * startSlotでページをまたいでも推薦の流れを継続する。
 */
export function rankConcernFeedCandidates(
  candidates: ConcernFeedCandidate[],
  history: RecommendationHistory[],
  previousClusterId?: string | null,
  startSlot = 0,
): RankedConcernFeedItem[] {
  const viewedClusterIds = new Set(
    history.flatMap((entry) => (entry.clusterId ? [entry.clusterId] : [])),
  );
  const remaining = [...candidates];
  const ranked: RankedConcernFeedItem[] = [];
  let lastClusterId = previousClusterId ?? null;

  while (remaining.length > 0) {
    // 異なるテーマがあれば連続を避ける。未分類は一つのテーマにまとめない。
    const differentCluster = lastClusterId
      ? remaining.filter((candidate) => candidate.cluster?.id !== lastClusterId)
      : remaining;
    const diversePool =
      differentCluster.length > 0 ? differentCluster : remaining;
    const unread = diversePool.filter((candidate) => !candidate.viewed);
    const pool = unread.length > 0 ? unread : diversePool;
    const slot = (startSlot + ranked.length) % RECOMMENDATION_CYCLE_LENGTH;
    let preferred = pool;
    let reasonCode: RecommendationReasonCode | undefined;

    if (slot === 0) {
      const familiar = pool.filter(
        (candidate) =>
          candidate.cluster && viewedClusterIds.has(candidate.cluster.id),
      );
      if (familiar.length > 0) {
        preferred = familiar;
        reasonCode = "familiar_theme";
      }
    } else if (slot === 1) {
      const discovery = pool.filter(
        (candidate) =>
          !candidate.cluster || !viewedClusterIds.has(candidate.cluster.id),
      );
      if (discovery.length > 0) {
        preferred = discovery;
        reasonCode = "discovery";
      }
    } else {
      reasonCode = "less_heard";
    }

    preferred.sort((left, right) => {
      if (slot === 2) {
        const readershipDifference =
          (left.readerCount ?? 0) - (right.readerCount ?? 0);
        if (readershipDifference !== 0) return readershipDifference;
        // 同じ閲覧者数なら、長く待っている投稿にも機会を作る。
        const ageDifference = left.concern.createdAt.localeCompare(
          right.concern.createdAt,
        );
        if (ageDifference !== 0) return ageDifference;
      }
      return (
        right.concern.createdAt.localeCompare(left.concern.createdAt) ||
        right.concern.id.localeCompare(left.concern.id)
      );
    });

    const next = preferred[0];
    if (!next) break;
    remaining.splice(remaining.indexOf(next), 1);
    ranked.push({
      ...next,
      recommendation: {
        strategy: "recommended",
        reasonCode:
          reasonCode ??
          (!next.viewed && next.cluster ? "unread_cluster" : "newest"),
      },
    });
    lastClusterId = next.cluster?.id ?? null;
  }

  return ranked;
}
