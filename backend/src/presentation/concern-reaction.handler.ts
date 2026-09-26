import { createFactory } from "hono/factory";
import { z } from "zod";

import type { AuthVariables } from "../app/middleware/auth";
import { getRequestId } from "../app/request-id";
import { REACTION_TYPES } from "../application/entity/concern-reaction";
import type { IConcernReactionUseCase } from "../application/usecase/concern-reaction.usecase";
import type { Bindings } from "../types";

const registerReactionRequest = z.object({
  reactionType: z.enum(REACTION_TYPES),
});

type RegisterReactionRequest = z.infer<typeof registerReactionRequest>;
type ConcernReactionVariables = AuthVariables & { requestId: string };
type ConcernReactionEnvironment = {
  Bindings: Bindings;
  Variables: ConcernReactionVariables;
};
type ConcernReactionInput = {
  in: { json: RegisterReactionRequest };
  out: { json: RegisterReactionRequest };
};
type ConcernReactionPath = "/api/v1/concerns/:concernId/reactions";

const factory = createFactory<
  ConcernReactionEnvironment,
  ConcernReactionPath
>();

const setRequestIdMiddleware = factory.createMiddleware(async (c, next) => {
  const requestId = getRequestId(c.req.raw);
  c.set("requestId", requestId);
  c.header("X-Request-Id", requestId);
  await next();
});

const validateReactionRequest = factory.createMiddleware<ConcernReactionInput>(
  async (c, next) => {
    const parsed = registerReactionRequest.safeParse(await readJson(c.req.raw));
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
            requestId: c.var.requestId,
          },
        },
        400,
      );
    }

    c.req.addValidatedData("json", parsed.data);
    await next();
  },
);

export class ConcernReactionHandler {
  private readonly reactionUseCase: IConcernReactionUseCase;

  constructor(reactionUseCase: IConcernReactionUseCase) {
    this.reactionUseCase = reactionUseCase;
  }

  readonly register = factory.createHandlers(
    setRequestIdMiddleware,
    async (c, next) => {
      if (!c.var.auth?.user) {
        return c.json(
          {
            error: {
              code: "AUTHENTICATION_REQUIRED",
              message: "リアクションにはLINEログインが必要です",
              requestId: c.var.requestId,
            },
          },
          401,
        );
      }
      await next();
    },
    validateReactionRequest,
    async (c) => {
      const auth = c.var.auth;
      if (!auth?.user) {
        return c.json(
          {
            error: {
              code: "AUTHENTICATION_REQUIRED",
              message: "リアクションにはLINEログインが必要です",
              requestId: c.var.requestId,
            },
          },
          401,
        );
      }

      const concernId = c.req.param("concernId");
      if (!concernId) {
        return c.json(
          {
            error: {
              code: "NOT_FOUND",
              message: "悩みが見つかりません",
              requestId: c.var.requestId,
            },
          },
          404,
        );
      }

      const { reactionType } = c.req.valid("json");
      const result = await this.reactionUseCase.register({
        concernId,
        userId: auth.user.id,
        reactionType,
      });

      if (!result) {
        return c.json(
          {
            error: {
              code: "NOT_FOUND",
              message: "悩みが見つかりません",
              requestId: c.var.requestId,
            },
          },
          404,
        );
      }

      const response = {
        concernId: result.reaction.concernId,
        reactionType: result.reaction.reactionType,
        reactionCount: result.reactionCount,
        reacted: true as const,
      };

      if (result.created) {
        return c.json(response, 201);
      }
      return c.json(response, 200);
    },
  );

  readonly remove = factory.createHandlers(
    setRequestIdMiddleware,
    async (c, next) => {
      if (!c.var.auth?.user) {
        return c.json(
          {
            error: {
              code: "AUTHENTICATION_REQUIRED",
              message: "リアクションにはLINEログインが必要です",
              requestId: c.var.requestId,
            },
          },
          401,
        );
      }
      await next();
    },
    async (c) => {
      const auth = c.var.auth;
      if (!auth?.user) {
        return c.json(
          {
            error: {
              code: "AUTHENTICATION_REQUIRED",
              message: "リアクションにはLINEログインが必要です",
              requestId: c.var.requestId,
            },
          },
          401,
        );
      }

      const concernId = c.req.param("concernId");
      if (!concernId) {
        return c.json(
          {
            error: {
              code: "NOT_FOUND",
              message: "悩みが見つかりません",
              requestId: c.var.requestId,
            },
          },
          404,
        );
      }

      const result = await this.reactionUseCase.remove({
        concernId,
        userId: auth.user.id,
        reactionType: "empathy",
      });

      if (!result) {
        return c.json(
          {
            error: {
              code: "NOT_FOUND",
              message: "悩みが見つかりません",
              requestId: c.var.requestId,
            },
          },
          404,
        );
      }

      return c.json({
        concernId: result.reaction.concernId,
        reactionType: result.reaction.reactionType,
        reactionCount: result.reactionCount,
        reacted: false as const,
      });
    },
  );
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}
