import { createFactory } from "hono/factory";
import { z } from "zod";

import type { AuthVariables } from "../app/middleware/auth";
import { getRequestId } from "../app/request-id";
import {
  type AgeGroup,
  type Concern,
  ConcernValidationError,
  type Gender,
} from "../application/entity/concern";
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

const CONCERN_SORT_OPTIONS = ["newest"] as const;

const listConcernQuery = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().min(1).optional(),
    sort: z.enum(CONCERN_SORT_OPTIONS).default("newest"),
  })
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
      });

      return c.json(toResponse(concern), 201);
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

    const cursor = parsed.data.cursor
      ? (decodeConcernCursor(parsed.data.cursor) ?? undefined)
      : undefined;
    if (parsed.data.cursor && !cursor) {
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

    const result = await this.concernUsecase.listPublished({
      limit: parsed.data.limit,
      cursor,
    });
    const nextCursor = result.nextCursor
      ? encodeConcernCursor(result.nextCursor)
      : null;

    return c.json({
      items: result.items.map((concern) => toFeedResponse(concern, true)),
      nextCursor,
    });
  });

  readonly detail = factory.createHandlers(async (c) => {
    const requestId = setRequestId(c);
    const concern = await this.concernUsecase.findPublishedById(
      c.req.param("concernId") ?? "",
    );
    if (!concern) {
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

    return c.json(toFeedResponse(concern, false));
  });
}

function toResponse(concern: Concern) {
  return {
    id: concern.id,
    body: concern.body,
    attributes: {
      ageGroup: concern.ageGroup ?? undefined,
      gender: concern.gender ?? undefined,
      regionCode: concern.regionCode ?? undefined,
    },
    visibilityStatus: concern.visibilityStatus,
    processingStatus: concern.processingStatus,
    representations: { jaHira: null, en: null },
    cluster: null,
    reactionCount: 0,
    createdAt: concern.createdAt,
  };
}

function toFeedResponse(concern: Concern, includeRecommendation: boolean) {
  return {
    id: concern.id,
    body: concern.body,
    language: "original" as const,
    attributes: {
      ageGroup: concern.ageGroup ?? undefined,
      gender: concern.gender ?? undefined,
      regionCode: concern.regionCode ?? undefined,
    },
    representations: {
      jaHira: toRepresentationStatus(concern),
      en: toRepresentationStatus(concern),
    },
    cluster: null,
    reactionCount: 0,
    viewed: false,
    reacted: false,
    ...(includeRecommendation
      ? {
          recommendation: {
            strategy: "newest" as const,
            reasonCode: "newest" as const,
          },
        }
      : {}),
    createdAt: concern.createdAt,
  };
}

function toRepresentationStatus(concern: Concern) {
  return concern.processingStatus === "ready"
    ? "ready"
    : concern.processingStatus === "failed"
      ? "failed"
      : "pending";
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
