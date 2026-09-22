import type { ErrorHandler } from "hono";

import type { SessionView } from "../application/usecase/auth.usecase";
import { logError } from "../logger";
import type { Bindings } from "../types";
import { getRequestId } from "./request-id";

export const handleError: ErrorHandler<{
  Bindings: Bindings;
  Variables: { auth: SessionView | null };
}> = (error, c) => {
  const requestId = getRequestId(c.req.raw);
  logError("unhandled error", {
    requestId,
    method: c.req.method,
    path: c.req.path,
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  c.header("X-Request-Id", requestId);
  return c.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "サーバー内部でエラーが発生しました",
        requestId,
      },
    },
    500,
  );
};
