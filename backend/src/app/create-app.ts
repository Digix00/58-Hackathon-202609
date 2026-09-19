import { Hono } from "hono";
import { cors } from "hono/cors";

import type { HealthHandler } from "../presentation/health.handler";
import type { Bindings } from "../types";
import { handleError } from "./error-handler";
import { requestLogger } from "./middleware/request-logger";

export interface ApplicationDependencies {
  healthHandler: HealthHandler;
}

/** DI済みのハンドラーをルートへ接続し、Honoアプリケーションを構築する。 */
export function createApp({ healthHandler }: ApplicationDependencies) {
  const app = new Hono<{ Bindings: Bindings }>();

  app.use("*", requestLogger);
  app.use(
    "*",
    cors({ origin: (_origin, c) => c.env.CORS_ORIGIN ?? "*" }),
  );
  app.onError(handleError);

  // 同じ式でチェーンし、Hono RPCがルートとレスポンスの型を保持できるようにする。
  return app.get("/health", ...healthHandler.get);
}

export type AppType = ReturnType<typeof createApp>;
