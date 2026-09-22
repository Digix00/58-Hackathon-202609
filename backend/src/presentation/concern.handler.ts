import { createFactory } from "hono/factory";
import { z } from "zod";

import type { AuthVariables } from "../app/middleware/auth";
import { getRequestId } from "../app/request-id";
import {
  AGE_GROUPS,
  CONCERN_BODY_MAX_LENGTH,
  CONCERN_INPUT_METHODS,
  GENDERS,
  type Concern,
} from "../application/entity/concern";
import { REGION_CODES } from "../application/entity/region-code";
import type { CreateConcern } from "../application/usecase/create-concern.usecase";
import type { Bindings } from "../types";

const createConcernRequest = z.object({
  body: z.string().trim().min(1).max(CONCERN_BODY_MAX_LENGTH),
  ageGroup: z.enum(AGE_GROUPS).optional(),
  gender: z.enum(GENDERS).optional(),
  regionCode: z.enum(REGION_CODES).optional(),
  inputMethod: z.enum(CONCERN_INPUT_METHODS),
});

const factory = createFactory<{ Bindings: Bindings; Variables: AuthVariables }>();

export class ConcernHandler {
  private readonly createConcern: CreateConcern;

  constructor(createConcern: CreateConcern) {
    this.createConcern = createConcern;
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

    const concern = await this.createConcern.execute({
      userId: auth.user.id,
      body: parsed.data.body,
      ageGroup: parsed.data.ageGroup,
      gender: parsed.data.gender,
      regionCode: parsed.data.regionCode,
      inputMethod: parsed.data.inputMethod,
    });

    return c.json(toResponse(concern), 201);
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
