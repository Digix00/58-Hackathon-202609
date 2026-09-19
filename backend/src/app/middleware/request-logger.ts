import type { MiddlewareHandler } from "hono";

import type { Bindings } from "../../types";

/** Cloudflare Workers Logs向けの構造化アクセスログ。 */
export const requestLogger: MiddlewareHandler<{ Bindings: Bindings }> = async (
  c,
  next,
) => {
  const start = Date.now();
  await next();
  console.log(
    JSON.stringify({
      severity: c.res.ok ? "INFO" : "ERROR",
      message: "request",
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs: Date.now() - start,
    }),
  );
};
