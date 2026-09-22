import { createFactory } from "hono/factory";
import { z } from "zod";

import type { AuthVariables } from "../app/middleware/auth";
import { getRequestId } from "../app/request-id";
import {
  ConcernValidationError,
  type AgeGroup,
  type Concern,
  type ConcernInputMethod,
  type Gender,
} from "../application/entity/concern";
import type { ConcernUsecase } from "../application/usecase/concern.usecase";
import type { Bindings } from "../types";

// 構造（型・必須項目）の検証だけをここで行う。本文長さや属性値の妥当性といった
// ドメインルールはConcernのコンストラクタが検証し、ConcernValidationErrorとして返す。
const createConcernRequest = z.object({
  body: z.string(),
  ageGroup: z.string().optional(),
  gender: z.string().optional(),
  regionCode: z.string().optional(),
  inputMethod: z.string(),
});

const factory = createFactory<{ Bindings: Bindings; Variables: AuthVariables }>();

export class ConcernHandler {
  private readonly concernUsecase: ConcernUsecase;

  constructor(concernUsecase: ConcernUsecase) {
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
        inputMethod: parsed.data.inputMethod as ConcernInputMethod,
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
    inputMethod: concern.inputMethod,
    visibilityStatus: concern.visibilityStatus,
    processingStatus: concern.processingStatus,
    representations: { jaHira: null, en: null },
    cluster: null,
    reactionCount: 0,
    createdAt: concern.createdAt,
  };
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
