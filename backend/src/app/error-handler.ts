import type { ErrorHandler } from "hono";

import type { SessionView } from "../application/usecase/auth.usecase";
import type { Bindings } from "../types";

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
  return c.json({ status: "error", message: "internal server error" }, 500);
};
