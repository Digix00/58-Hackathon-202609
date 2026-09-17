import type { ErrorHandler } from "hono";

import type { Bindings } from "../types";

export const handleError: ErrorHandler<{ Bindings: Bindings }> = (error, c) => {
  console.error(
    JSON.stringify({
      severity: "ERROR",
      message: "unhandled error",
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  return c.json({ status: "error", message: "internal server error" }, 500);
};
