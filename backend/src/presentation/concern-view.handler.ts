import { createFactory } from "hono/factory";

import type { AuthVariables } from "../app/middleware/auth";
import { getRequestId } from "../app/request-id";
import type { IConcernViewUseCase } from "../application/usecase/concern-view.usecase";
import type { Bindings } from "../types";

const factory = createFactory<{
  Bindings: Bindings;
  Variables: AuthVariables;
}>();

export class ConcernViewHandler {
  private readonly concernViewUseCase: IConcernViewUseCase;

  constructor(concernViewUseCase: IConcernViewUseCase) {
    this.concernViewUseCase = concernViewUseCase;
  }

  readonly record = factory.createHandlers(async (c) => {
    const requestId = getRequestId(c.req.raw);
    c.header("X-Request-Id", requestId);

    const auth = c.var.auth;
    if (!auth?.user) {
      return c.json(
        {
          error: {
            code: "AUTHENTICATION_REQUIRED",
            message: "既読の記録にはLINEログインが必要です",
            requestId,
          },
        },
        401,
      );
    }

    const concernId = c.req.param("concernId") ?? "";
    const view = await this.concernViewUseCase.record(concernId, auth.user.id);
    if (!view) {
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
      {
        concernId: view.concernId,
        viewed: true,
        viewedAt: view.viewedAt,
      },
      200,
    );
  });
}
