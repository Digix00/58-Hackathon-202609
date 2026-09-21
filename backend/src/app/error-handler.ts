import type { ErrorHandler } from "hono";

import type { SessionView } from "../application/usecase/auth.usecase";
import type { Bindings } from "../types";
import { getRequestId } from "./request-id";

export const handleError: ErrorHandler<{
  Bindings: Bindings;
  Variables: { auth: SessionView | null };
}> = (error, c) => {
  console.error(
    JSON.stringify({
      severity: "ERROR",
      message: "unhandled error",
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  const requestId = getRequestId(c.req.raw);
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
