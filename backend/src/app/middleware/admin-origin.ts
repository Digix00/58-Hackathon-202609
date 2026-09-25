import type { MiddlewareHandler } from "hono";

import type { Bindings } from "../../types";
import { getRequestId } from "../request-id";

type AdminOriginEnvironment = { Bindings: Bindings };

/** 管理画面からの状態変更リクエストだけを許可された Origin に制限する。 */
export const requireAllowedAdminOrigin: MiddlewareHandler<
  AdminOriginEnvironment
> = async (c, next) => {
  const expectedOrigin = parseOrigin(c.env.CORS_ORIGIN);
  const requestOrigin = parseOrigin(c.req.header("origin"));

  if (!expectedOrigin || !requestOrigin || requestOrigin !== expectedOrigin) {
    const requestId = getRequestId(c.req.raw);
    c.header("X-Request-Id", requestId);
    return c.json(
      {
        error: {
          code: "ADMIN_ORIGIN_FORBIDDEN",
          message: "許可されたオリジンからの操作ではありません",
          requestId,
        },
      },
      403,
    );
  }

  await next();
};

function parseOrigin(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === "*" || trimmed === "null") {
    return null;
  }

  try {
    const url = new URL(trimmed);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}
