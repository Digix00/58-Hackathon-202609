import { createFactory } from "hono/factory";
import { z } from "zod";

import type { AuthVariables } from "../app/middleware/auth";
import { getRequestId } from "../app/request-id";
import {
  getAgeGroupName,
  getGenderName,
} from "../application/entity/attribute-name";
import {
  type AgeGroup,
  type Concern,
  ConcernValidationError,
  GENDERS,
  type Gender,
} from "../application/entity/concern";
import type { RankedConcernFeedItem } from "../application/entity/feed";
import { REGION_CODES } from "../application/entity/region-code";
import { getRegionName } from "../application/entity/region-name";
import type { DisplayLanguage } from "../application/entity/user";
import {
  CONCERN_LANGUAGES,
  type ConcernLanguage,
  getConcernRepresentationState,
  resolveConcernLanguage,
  selectConcernText,
} from "../application/shared/concern-representation";
import type { IConcernUseCase } from "../application/usecase/concern.usecase";
import type { Bindings } from "../types";
import { decodeConcernCursor, encodeConcernCursor } from "./concern-cursor";

// 構造（型・必須項目）の検証だけをここで行う。本文長さや属性値の妥当性といった
// ドメインルールはConcernのコンストラクタが検証し、ConcernValidationErrorとして返す。
const createConcernRequest = z.object({
  body: z.string(),
  ageGroup: z.string().optional(),
  gender: z.string().optional(),
  regionCode: z.string().optional(),
});

const CONCERN_SORT_OPTIONS = ["newest", "recommended"] as const;

const listConcernQuery = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().min(1).optional(),
    sort: z.enum(CONCERN_SORT_OPTIONS).default("newest"),
    clusterId: z.string().min(1).optional(),
    gender: z.enum(GENDERS).optional(),
    regionCode: z.enum(REGION_CODES).optional(),
    language: z.enum(CONCERN_LANGUAGES).optional(),
  })
  .strict();
const concernLanguageQuery = z
  .object({ language: z.enum(CONCERN_LANGUAGES).optional() })
  .strict();

const factory = createFactory<{
  Bindings: Bindings;
  Variables: AuthVariables;
}>();

export class ConcernHandler {
  private readonly concernUsecase: IConcernUseCase;

  constructor(concernUsecase: IConcernUseCase) {
    this.concernUsecase = concernUsecase;
  }

  readonly create = factory.createHandlers(async (c) => {
    const requestId = setRequestId(c);
    const auth = c.var.auth;
    if (!auth?.user) {
      return c.json(
        {
          error: {
            code: "AUTHENTICATION_REQUIRED",
            message: "投稿にはLINEログインが必要です",
            requestId,
          },
        },
        401,
      );
    }

    const parsed = createConcernRequest.safeParse(await readJson(c.req.raw));
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "INVALID_REQUEST",
            message: "入力内容を確認してください",
            details: parsed.error.issues.map((issue) => ({
              field: issue.path.join(".") || "body",
              reason: issue.code,
            })),
            requestId,
          },
        },
        400,
      );
    }

    try {
      const concern = await this.concernUsecase.create({
        userId: auth.user.id,
        body: parsed.data.body,
        ageGroup: parsed.data.ageGroup as AgeGroup | undefined,
        gender: parsed.data.gender as Gender | undefined,
        regionCode: parsed.data.regionCode,
        userProfile: {
          birthYear: auth.user.birthYear,
          birthMonth: auth.user.birthMonth,
          gender: auth.user.gender,
          regionCode: auth.user.regionCode,
        },
      });

      return c.json(toResponse(concern, auth.user.displayLanguage), 201);
    } catch (error) {
      if (error instanceof ConcernValidationError) {
        return c.json(
          {
            error: {
              code: "INVALID_REQUEST",
              message: "入力内容を確認してください",
              details: [{ field: error.field, reason: "invalid" }],
              requestId,
            },
          },
          400,
        );
      }
      throw error;
    }
  });

  readonly list = factory.createHandlers(async (c) => {
    const requestId = setRequestId(c);
    const parsed = listConcernQuery.safeParse(c.req.query());
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "INVALID_REQUEST",
            message: "取得条件を確認してください",
            details: parsed.error.issues.map((issue) => ({
              field: issue.path.join(".") || "query",
              reason: issue.code,
            })),
            requestId,
          },
        },
        400,
      );
    }

    const auth = c.var.auth;
    // 公開フィードは未ログインでも読める。認証状態とCookieが一時的に
    // 食い違って recommended が指定されても、新着順へ落として閲覧を継続する。
    const sort =
      parsed.data.sort === "recommended" && !auth?.user
        ? "newest"
        : parsed.data.sort;

    const cursorContext = {
      sort,
      regionCode: parsed.data.regionCode,
      clusterId: parsed.data.clusterId,
      gender: parsed.data.gender,
    } as const;
    const decodedCursor = parsed.data.cursor
      ? decodeConcernCursor(parsed.data.cursor, cursorContext)
      : undefined;
    const cursor = decodedCursor?.cursor;
    const recommendationCursor = decodedCursor?.recommendationCursor;
    if (parsed.data.cursor && !decodedCursor) {
      return c.json(
        {
          error: {
            code: "INVALID_CURSOR",
            message: "ページングカーソルが不正です",
            requestId,
          },
        },
        400,
      );
    }

    if (this.concernUsecase.listFeed) {
      const result = await this.concernUsecase.listFeed({
        limit: parsed.data.limit,
        cursor,
        sort,
        gender: parsed.data.gender,
        regionCode: parsed.data.regionCode,
        clusterId: parsed.data.clusterId,
        userId: auth?.user?.id,
        recommendationCursor,
      });
      const nextCursor = result.nextCursor
        ? encodeConcernCursor(result.nextCursor, cursorContext)
        : null;

      return c.json({
        items: result.items.map((item) =>
          toFeedResponse(
            item,
            true,
            resolveConcernLanguage(
              parsed.data.language,
              auth?.user?.displayLanguage,
            ),
          ),
        ),
        nextCursor,
      });
    }

    const result = await this.concernUsecase.listPublished({
      limit: parsed.data.limit,
      cursor,
      gender: parsed.data.gender,
    });
    const nextCursor = result.nextCursor
      ? encodeConcernCursor(result.nextCursor, cursorContext)
      : null;

    return c.json({
      items: result.items.map((concern) =>
        toFeedResponse(
          concern,
          true,
          resolveConcernLanguage(
            parsed.data.language,
            auth?.user?.displayLanguage,
          ),
        ),
      ),
      nextCursor,
    });
  });

  readonly detail = factory.createHandlers(async (c) => {
    const requestId = setRequestId(c);
    const parsed = concernLanguageQuery.safeParse(c.req.query());
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "INVALID_REQUEST",
            message: "取得条件を確認してください",
            details: parsed.error.issues.map((issue) => ({
              field: issue.path.join(".") || "query",
              reason: issue.code,
            })),
            requestId,
          },
        },
        400,
      );
    }

    const userId = c.var.auth?.user?.id;
    const item = this.concernUsecase.findPublishedFeedItem
      ? await this.concernUsecase.findPublishedFeedItem(
          c.req.param("concernId") ?? "",
          userId,
        )
      : await this.concernUsecase.findPublishedById(
          c.req.param("concernId") ?? "",
        );
    if (!item) {
      return c.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "投稿が見つかりません",
            requestId,
          },
        },
        404,
      );
    }

    return c.json(
      toFeedResponse(
        item,
        false,
        resolveConcernLanguage(
          parsed.data.language,
          c.var.auth?.user?.displayLanguage,
        ),
      ),
    );
  });
}

function toResponse(concern: Concern, displayLanguage: DisplayLanguage) {
  return {
    id: concern.id,
    body: concern.body,
    attributes: toAttributesResponse(concern, displayLanguage),
    visibilityStatus: concern.visibilityStatus,
    processingStatus: concern.processingStatus,
    representations: { jaHira: null, en: null },
    cluster: null,
    reactionCount: 0,
    createdAt: concern.createdAt,
  };
}

function toFeedResponse(
  source: Concern | RankedConcernFeedItem,
  includeRecommendation: boolean,
  language: ConcernLanguage,
) {
  const candidate = isFeedItem(source)
    ? source
    : {
        concern: source,
        cluster: null,
        viewed: false,
        reactionCount: 0,
        reacted: false,
      };
  const concern = candidate.concern;
  const selectedText = selectConcernText(
    concern.body,
    concern.representations,
    language,
  );

  return {
    id: concern.id,
    body: selectedText.body,
    language: selectedText.language,
    attributes: toAttributesResponse(concern, language),
    representations: {
      jaHira: getConcernRepresentationState(
        concern.representations,
        concern.processingStatus,
        "ja-Hira",
      ),
      en: getConcernRepresentationState(
        concern.representations,
        concern.processingStatus,
        "en",
      ),
    },
    cluster: candidate.cluster
      ? {
          id: candidate.cluster.id,
          label: candidate.cluster.label,
          summary: candidate.cluster.summary,
        }
      : null,
    reactionCount: candidate.reactionCount ?? 0,
    viewed: candidate.viewed,
    reacted: candidate.reacted ?? false,
    ...(includeRecommendation
      ? {
          recommendation: isFeedItem(source)
            ? source.recommendation
            : {
                strategy: "newest" as const,
                reasonCode: "newest" as const,
              },
        }
      : {}),
    createdAt: concern.createdAt,
  };
}

/** 属性コードに、表示形式に合わせたマスタ上の名称を添える。 */
function toAttributesResponse(
  concern: Concern,
  displayLanguage: DisplayLanguage,
) {
  return {
    ageGroup: concern.ageGroup ?? undefined,
    ageGroupName: getAgeGroupName(concern.ageGroup, displayLanguage),
    gender: concern.gender ?? undefined,
    genderName: getGenderName(concern.gender, displayLanguage),
    regionCode: concern.regionCode ?? undefined,
    regionName: getRegionName(concern.regionCode, displayLanguage),
  };
}

function isFeedItem(
  source: Concern | RankedConcernFeedItem,
): source is RankedConcernFeedItem {
  return "concern" in source;
}

function setRequestId(c: {
  header(name: string, value: string): void;
  req: { raw: Request };
}): string {
  const requestId = getRequestId(c.req.raw);
  c.header("X-Request-Id", requestId);
  return requestId;
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}
