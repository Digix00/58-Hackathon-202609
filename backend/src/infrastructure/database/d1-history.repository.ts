import type {
  HistoryCount,
  HistoryNextSuggestion,
  HistorySummaryStats,
  QuizAnswerHistoryCursor,
  QuizAnswerHistoryItem,
  QuizAnswerHistoryPage,
} from "../../application/entity/history";
import type { HistoryRepository } from "../../application/repository/history.repository";

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

interface NextSuggestionRow {
  kind: "theme" | "region";
  themeLabel: string | null;
  regionCode: string | null;
}

/** D1上の既読・クイズ結果を使って学習履歴を集計するAdapter。 */
export class D1HistoryRepository implements HistoryRepository {
  private readonly database: D1Database;

  constructor(database: D1Database) {
    this.database = database;
  }

  async isUserDeleted(userId: string): Promise<boolean> {
    const row = await this.database
      .prepare("SELECT deleted_at AS deletedAt FROM users WHERE id = ?")
      .bind(userId)
      .first<{ deletedAt: string | null }>();
    return row?.deletedAt !== null && row?.deletedAt !== undefined;
  }

  async getSummaryStats(userId: string): Promise<HistorySummaryStats> {
    const [viewCount, clusters, regions, ageGroups, genders, quiz] =
      await Promise.all([
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
        this.database
          .prepare(
            "SELECT concerns.cluster_id AS clusterId, concern_clusters.label AS label, " +
              "COUNT(DISTINCT concerns.id) AS count " +
              "FROM concern_views " +
              "INNER JOIN concerns ON concerns.id = concern_views.concern_id " +
              "INNER JOIN concern_clusters ON concern_clusters.id = concerns.cluster_id " +
              "WHERE concern_views.actor_key = ? " +
              "AND concerns.visibility_status = 'published' " +
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
        "SELECT CASE WHEN concern_clusters.status = 'ready' " +
          "AND concern_clusters.label IS NOT NULL THEN 'theme' ELSE 'region' END AS kind, " +
          "concern_clusters.label AS themeLabel, concerns.region_code AS regionCode " +
          "FROM concerns " +
          "LEFT JOIN concern_clusters ON concern_clusters.id = concerns.cluster_id " +
          "WHERE concerns.visibility_status = 'published' " +
          "AND concerns.user_id <> ? " +
          "AND NOT EXISTS (SELECT 1 FROM concern_views " +
          "WHERE concern_views.concern_id = concerns.id AND concern_views.actor_key = ?) " +
          "AND ((concern_clusters.status = 'ready' AND concern_clusters.label IS NOT NULL) " +
          "OR concerns.region_code IS NOT NULL) " +
          "ORDER BY CASE WHEN concern_clusters.status = 'ready' " +
          "AND concern_clusters.label IS NOT NULL THEN 0 ELSE 1 END ASC, " +
          "concerns.created_at DESC, concerns.id DESC LIMIT 1",
      )
      .bind(userId, userId)
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
