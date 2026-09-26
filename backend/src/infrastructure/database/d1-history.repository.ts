import { and, desc, eq, lt, ne, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";

import {
  type AgeGroup,
  Concern,
  type ConcernProcessingStatus,
  type ConcernVisibilityStatus,
  type Gender,
} from "../../application/entity/concern";
import { ConcernCluster } from "../../application/entity/concern-cluster";
import type {
  HistoryConcernCursor,
  HistoryConcernEntry,
  HistoryConcernPage,
  HistoryContributionStats,
  HistoryCount,
  HistoryNextSuggestion,
  HistorySummaryStats,
  QuizAnswerHistoryCursor,
  QuizAnswerHistoryItem,
  QuizAnswerHistoryPage,
} from "../../application/entity/history";
import type { HistoryRepository } from "../../application/repository/history.repository";
import { loadConcernRepresentations } from "./concern-representation.reader";
import { concernClusters, concernReactions, concerns } from "./schema";

interface CountRow {
  count: number;
}

interface ClusterRow extends CountRow {
  clusterId: string;
  label: string;
}

interface ValueCountRow extends CountRow {
  value: string;
}

interface QuizSummaryRow {
  answeredCount: number;
  correctCount: number;
  totalQuestions: number;
}

interface QuizAnswerRow extends QuizAnswerHistoryItem {}

/** 履歴一覧が1件ずつ読み出す、投稿とクラスタと寄りそい件数の行。 */
interface HistoryConcernRow {
  id: string;
  body: string;
  ageGroup: string | null;
  genderCode: string | null;
  regionCode: string | null;
  clusterId: string | null;
  visibilityStatus: string;
  processingStatus: string;
  createdAt: string;
  clusterLabel: string | null;
  clusterSummary: string | null;
  clusterStatus: string | null;
  reactionCount: number;
  reactedAt: string | null;
  sortedAt: string;
}

interface NextSuggestionRow {
  kind: "theme" | "region";
  themeLabel: string | null;
  regionCode: string | null;
}

/** 履歴一覧が読み出す投稿の列。自分の投稿と寄りそった投稿で共通に使う。 */
const CONCERN_FIELDS = {
  id: concerns.id,
  body: concerns.body,
  ageGroup: concerns.ageGroup,
  genderCode: concerns.genderCode,
  regionCode: concerns.regionCode,
  clusterId: concerns.clusterId,
  visibilityStatus: concerns.visibilityStatus,
  processingStatus: concerns.processingStatus,
  createdAt: concerns.createdAt,
  clusterLabel: concernClusters.label,
  clusterSummary: concernClusters.summary,
  clusterStatus: concernClusters.status,
} as const;

/** その投稿に寄りそった人数。一覧の1行ごとに数える。 */
const REACTION_COUNT = sql<number>`(SELECT COUNT(*) FROM ${concernReactions} WHERE ${concernReactions.concernId} = ${concerns.id})`;

/**
 * 続きの位置より後ろだけに絞る。並び順の基準列が同じ値のときは、
 * 並びの第2キーである投稿IDで比べる。
 */
function afterCursor(sortedAt: SQLiteColumn, cursor: HistoryConcernCursor) {
  return or(
    lt(sortedAt, cursor.sortedAt),
    and(eq(sortedAt, cursor.sortedAt), lt(concerns.id, cursor.concernId)),
  );
}

/** D1上の既読・投稿・寄りそい・クイズ結果を使って学習履歴を読み出すAdapter。 */
export class D1HistoryRepository implements HistoryRepository {
  private readonly database: D1Database;
  /** 本文の表現行は複数投稿分をまとめて引くため、既存のreaderを共有する。 */
  private readonly db: ReturnType<typeof drizzle>;

  constructor(database: D1Database) {
    this.database = database;
    this.db = drizzle(database);
  }

  async isUserDeleted(userId: string): Promise<boolean> {
    const row = await this.database
      .prepare("SELECT deleted_at AS deletedAt FROM users WHERE id = ?")
      .bind(userId)
      .first<{ deletedAt: string | null }>();
    return row?.deletedAt !== null && row?.deletedAt !== undefined;
  }

  async getSummaryStats(userId: string): Promise<HistorySummaryStats> {
    const [
      viewCount,
      contributions,
      clusters,
      regions,
      ageGroups,
      genders,
      quiz,
    ] = await Promise.all([
      this.database
        .prepare(
          "SELECT COUNT(DISTINCT concerns.id) AS count " +
            "FROM concern_views " +
            "INNER JOIN concerns ON concerns.id = concern_views.concern_id " +
            "WHERE concern_views.actor_key = ? " +
            "AND concerns.visibility_status = 'published'",
        )
        .bind(userId)
        .first<CountRow>(),
      this.getContributionStats(userId),
      this.database
        .prepare(
          "SELECT concerns.cluster_id AS clusterId, concern_clusters.label AS label, " +
            "COUNT(DISTINCT concerns.id) AS count " +
            "FROM concern_views " +
            "INNER JOIN concerns ON concerns.id = concern_views.concern_id " +
            "INNER JOIN concern_clusters ON concern_clusters.id = concerns.cluster_id " +
            "WHERE concern_views.actor_key = ? " +
            "AND concerns.visibility_status = 'published' " +
            "AND concerns.processing_status = 'ready' " +
            "AND concern_clusters.status = 'ready' " +
            "AND concern_clusters.label IS NOT NULL " +
            "GROUP BY concerns.cluster_id, concern_clusters.label " +
            "ORDER BY count DESC, concerns.cluster_id ASC",
        )
        .bind(userId)
        .all<ClusterRow>(),
      this.getConcernValueCounts(userId, "region_code"),
      this.getConcernValueCounts(userId, "age_group"),
      this.getConcernValueCounts(userId, "gender_code"),
      this.database
        .prepare(
          "SELECT COUNT(*) AS answeredCount, COALESCE(SUM(score), 0) AS correctCount, " +
            "COUNT(*) * 3 AS totalQuestions " +
            "FROM quiz_attempts WHERE user_id = ?",
        )
        .bind(userId)
        .first<QuizSummaryRow>(),
    ]);

    return {
      viewedConcernCount: viewCount?.count ?? 0,
      contributions,
      clusters: clusters.results,
      regions: regions.map(({ value, count }) => ({
        regionCode: value,
        count,
      })),
      attributes: {
        ageGroups: ageGroups.map(({ value, count }) => ({
          ageGroup: value,
          count,
        })),
        genders: genders.map(({ value, count }) => ({ gender: value, count })),
      },
      quiz: {
        answeredCount: quiz?.answeredCount ?? 0,
        correctCount: quiz?.correctCount ?? 0,
        totalQuestions: quiz?.totalQuestions ?? 0,
      },
    };
  }

  async getNextSuggestion(
    userId: string,
  ): Promise<HistoryNextSuggestion | null> {
    const row = await this.database
      .prepare(
        "WITH viewed_themes AS ( " +
          "SELECT DISTINCT viewed_concerns.cluster_id AS clusterId " +
          "FROM concern_views AS viewed_views " +
          "INNER JOIN concerns AS viewed_concerns " +
          "ON viewed_concerns.id = viewed_views.concern_id " +
          "INNER JOIN concern_clusters AS viewed_clusters " +
          "ON viewed_clusters.id = viewed_concerns.cluster_id " +
          "WHERE viewed_views.actor_key = ? " +
          "AND viewed_concerns.visibility_status = 'published' " +
          "AND viewed_concerns.processing_status = 'ready' " +
          "AND viewed_clusters.status = 'ready' " +
          "AND viewed_clusters.label IS NOT NULL), " +
          "viewed_regions AS ( " +
          "SELECT DISTINCT viewed_concerns.region_code AS regionCode " +
          "FROM concern_views AS viewed_views " +
          "INNER JOIN concerns AS viewed_concerns " +
          "ON viewed_concerns.id = viewed_views.concern_id " +
          "WHERE viewed_views.actor_key = ? " +
          "AND viewed_concerns.visibility_status = 'published' " +
          "AND viewed_concerns.region_code IS NOT NULL) " +
          "SELECT CASE WHEN concerns.processing_status = 'ready' " +
          "AND concern_clusters.status = 'ready' " +
          "AND concern_clusters.label IS NOT NULL " +
          "AND viewed_themes.clusterId IS NULL THEN 'theme' ELSE 'region' END AS kind, " +
          "concern_clusters.label AS themeLabel, concerns.region_code AS regionCode " +
          "FROM concerns " +
          "LEFT JOIN concern_clusters ON concern_clusters.id = concerns.cluster_id " +
          "LEFT JOIN viewed_themes ON viewed_themes.clusterId = concerns.cluster_id " +
          "LEFT JOIN viewed_regions ON viewed_regions.regionCode = concerns.region_code " +
          "WHERE concerns.visibility_status = 'published' " +
          "AND concerns.user_id <> ? " +
          "AND NOT EXISTS (SELECT 1 FROM concern_views " +
          "WHERE concern_views.concern_id = concerns.id AND concern_views.actor_key = ?) " +
          "AND ((concerns.processing_status = 'ready' " +
          "AND concern_clusters.status = 'ready' " +
          "AND concern_clusters.label IS NOT NULL " +
          "AND viewed_themes.clusterId IS NULL) " +
          "OR (concerns.region_code IS NOT NULL " +
          "AND viewed_regions.regionCode IS NULL)) " +
          "ORDER BY CASE WHEN concerns.processing_status = 'ready' " +
          "AND concern_clusters.status = 'ready' " +
          "AND concern_clusters.label IS NOT NULL " +
          "AND viewed_themes.clusterId IS NULL THEN 0 ELSE 1 END ASC, " +
          "concerns.created_at DESC, concerns.id DESC LIMIT 1",
      )
      .bind(userId, userId, userId, userId)
      .first<NextSuggestionRow>();

    if (!row) return null;
    if (row.kind === "theme" && row.themeLabel) {
      return { kind: "theme", label: row.themeLabel };
    }
    return row.regionCode
      ? { kind: "region", regionCode: row.regionCode }
      : null;
  }

  async listQuizAnswers(
    userId: string,
    limit: number,
    cursor: QuizAnswerHistoryCursor | null,
  ): Promise<QuizAnswerHistoryPage> {
    const cursorClause = cursor
      ? " AND (quiz_attempts.answered_at < ? OR " +
        "(quiz_attempts.answered_at = ? AND quizzes.id < ?))"
      : "";
    const bindings = cursor
      ? [userId, cursor.answeredAt, cursor.answeredAt, cursor.quizId, limit + 1]
      : [userId, limit + 1];
    const result = await this.database
      .prepare(
        "SELECT quizzes.id AS quizId, quizzes.quiz_date AS quizDate, " +
          "quiz_attempts.score AS score, 3 AS total, " +
          "quiz_attempts.answered_at AS answeredAt " +
          "FROM quiz_attempts " +
          "INNER JOIN quizzes ON quizzes.id = quiz_attempts.quiz_id " +
          "WHERE quiz_attempts.user_id = ?" +
          cursorClause +
          " ORDER BY quiz_attempts.answered_at DESC, quizzes.id DESC LIMIT ?",
      )
      .bind(...bindings)
      .all<QuizAnswerRow>();

    const hasMore = result.results.length > limit;
    const items = result.results.slice(0, limit);
    const lastItem = items.at(-1);
    return {
      items,
      nextCursor:
        hasMore && lastItem
          ? { answeredAt: lastItem.answeredAt, quizId: lastItem.quizId }
          : null,
    };
  }

  async listOwnConcerns(
    userId: string,
    limit: number,
    cursor: HistoryConcernCursor | null,
  ): Promise<HistoryConcernPage> {
    // 削除済みだけを隠し、公開前・非公開の投稿も本人には見えるようにする。
    const rows = await this.db
      .select({
        ...CONCERN_FIELDS,
        reactionCount: REACTION_COUNT,
        reactedAt: sql<string | null>`NULL`,
        sortedAt: concerns.createdAt,
      })
      .from(concerns)
      .leftJoin(concernClusters, eq(concernClusters.id, concerns.clusterId))
      .where(
        and(
          eq(concerns.userId, userId),
          ne(concerns.visibilityStatus, "deleted"),
          cursor ? afterCursor(concerns.createdAt, cursor) : undefined,
        ),
      )
      .orderBy(desc(concerns.createdAt), desc(concerns.id))
      .limit(limit + 1)
      .all();

    return this.readConcernPage(rows, limit);
  }

  async listReactedConcerns(
    userId: string,
    limit: number,
    cursor: HistoryConcernCursor | null,
  ): Promise<HistoryConcernPage> {
    // 寄りそった順に読み返す。相手が非公開へ変えた投稿は履歴からも外す。
    const rows = await this.db
      .select({
        ...CONCERN_FIELDS,
        reactionCount: REACTION_COUNT,
        reactedAt: sql<string | null>`${concernReactions.createdAt}`,
        sortedAt: concernReactions.createdAt,
      })
      .from(concernReactions)
      .innerJoin(concerns, eq(concerns.id, concernReactions.concernId))
      .leftJoin(concernClusters, eq(concernClusters.id, concerns.clusterId))
      .where(
        and(
          eq(concernReactions.userId, userId),
          eq(concerns.visibilityStatus, "published"),
          cursor ? afterCursor(concernReactions.createdAt, cursor) : undefined,
        ),
      )
      .orderBy(desc(concernReactions.createdAt), desc(concerns.id))
      .limit(limit + 1)
      .all();

    return this.readConcernPage(rows, limit);
  }

  /** 一覧クエリの結果に本文の表現行を足し、次ページの位置を決める。 */
  private async readConcernPage(
    rows: HistoryConcernRow[],
    limit: number,
  ): Promise<HistoryConcernPage> {
    const hasMore = rows.length > limit;
    const pageRows = rows.slice(0, limit);
    const representations = await loadConcernRepresentations(
      this.db,
      pageRows.map((row) => row.id),
    );
    const lastRow = pageRows.at(-1);

    return {
      items: pageRows.map((row) =>
        toHistoryConcernEntry(row, representations.get(row.id)),
      ),
      nextCursor:
        hasMore && lastRow
          ? { sortedAt: lastRow.sortedAt, concernId: lastRow.id }
          : null,
    };
  }

  private async getContributionStats(
    userId: string,
  ): Promise<HistoryContributionStats> {
    const row = await this.database
      .prepare(
        "SELECT (SELECT COUNT(*) FROM concerns " +
          "WHERE concerns.user_id = ? " +
          "AND concerns.visibility_status <> 'deleted') AS concernCount, " +
          "(SELECT COUNT(*) FROM concern_reactions " +
          "INNER JOIN concerns ON concerns.id = concern_reactions.concern_id " +
          "WHERE concerns.user_id = ? " +
          "AND concerns.visibility_status <> 'deleted') AS receivedReactionCount, " +
          "(SELECT COUNT(*) FROM concern_reactions " +
          "INNER JOIN concerns ON concerns.id = concern_reactions.concern_id " +
          "WHERE concern_reactions.user_id = ? " +
          "AND concerns.visibility_status = 'published') AS givenReactionCount",
      )
      .bind(userId, userId, userId)
      .first<HistoryContributionStats>();

    return {
      concernCount: row?.concernCount ?? 0,
      receivedReactionCount: row?.receivedReactionCount ?? 0,
      givenReactionCount: row?.givenReactionCount ?? 0,
    };
  }

  private async getConcernValueCounts(
    userId: string,
    column: "region_code" | "age_group" | "gender_code",
  ): Promise<HistoryCount<string>[]> {
    const rows = await this.database
      .prepare(
        `SELECT concerns.${column} AS value, COUNT(DISTINCT concerns.id) AS count ` +
          "FROM concern_views " +
          "INNER JOIN concerns ON concerns.id = concern_views.concern_id " +
          `WHERE concern_views.actor_key = ? AND concerns.visibility_status = 'published' AND concerns.${column} IS NOT NULL ` +
          `GROUP BY concerns.${column} ORDER BY count DESC, concerns.${column} ASC`,
      )
      .bind(userId)
      .all<ValueCountRow>();

    return rows.results.map((row) => ({ value: row.value, count: row.count }));
  }
}

/** クラスタは、投稿と分類の両方が生成済みのときだけ表示対象にする。 */
function toHistoryConcernEntry(
  row: HistoryConcernRow,
  representations: ReturnType<
    Awaited<ReturnType<typeof loadConcernRepresentations>>["get"]
  > = [],
): HistoryConcernEntry {
  const concern = new Concern({
    id: row.id,
    // 履歴は本人の投稿だけを返すため、投稿者IDは応答へ出さない。
    userId: "",
    body: row.body,
    ageGroup: row.ageGroup as AgeGroup | null,
    gender: row.genderCode as Gender | null,
    regionCode: row.regionCode,
    clusterId: row.clusterId,
    visibilityStatus: row.visibilityStatus as ConcernVisibilityStatus,
    processingStatus: row.processingStatus as ConcernProcessingStatus,
    representations,
    createdAt: row.createdAt,
  });

  return {
    concern,
    cluster:
      row.clusterId &&
      row.processingStatus === "ready" &&
      row.clusterStatus === "ready"
        ? new ConcernCluster({
            id: row.clusterId,
            label: row.clusterLabel,
            summary: row.clusterSummary,
            status: row.clusterStatus,
          })
        : null,
    reactionCount: row.reactionCount,
    reactedAt: row.reactedAt,
  };
}
