import type { MiddlewareHandler } from "hono";

import { logError, logInfo } from "../../logger";
import type { Bindings } from "../../types";

/** Cloudflare Workers Logs向けの構造化アクセスログ。 */
export const requestLogger: MiddlewareHandler<{ Bindings: Bindings }> = async (
  c,
  next,
) => {
  const start = Date.now();
  await next();
  const context = {
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    durationMs: Date.now() - start,
  };
  if (c.res.ok) {
    logInfo("request", context);
  } else {
    logError("request", context);
  }
};
