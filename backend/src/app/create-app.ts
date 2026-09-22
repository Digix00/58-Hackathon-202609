import { Hono } from "hono";
import { cors } from "hono/cors";

import type { IAuthUseCase } from "../application/usecase/auth.usecase";
import type { AuthHandler } from "../presentation/auth.handler";
import type { ConcernHandler } from "../presentation/concern.handler";
import type { HealthHandler } from "../presentation/health.handler";
import type { UserHandler } from "../presentation/user.handler";
import type { Bindings } from "../types";
import { handleError } from "./error-handler";
import { createAuthMiddleware } from "./middleware/auth";
import { requestLogger } from "./middleware/request-logger";

export interface ApplicationDependencies {
  authHandler: AuthHandler;
  authUseCase: IAuthUseCase;
  concernHandler: ConcernHandler;
  healthHandler: HealthHandler;
  userHandler: UserHandler;
}

/** DI済みのハンドラーをルートへ接続し、Honoアプリケーションを構築する。 */
export function createApp({
  authHandler,
  authUseCase,
  concernHandler,
  healthHandler,
  userHandler,
}: ApplicationDependencies) {
  const app = new Hono<{
    Bindings: Bindings;
    Variables: {
      auth: Awaited<ReturnType<IAuthUseCase["getSession"]>>;
    };
  }>();

  app.use("*", requestLogger);
  app.use("*", (c, next) => {
    const origin = c.env.CORS_ORIGIN?.trim();
    return cors({
      origin: () => origin || "*",
      credentials: Boolean(origin),
    })(c, next);
  });
  app.onError(handleError);

  // 同じ式でチェーンし、Hono RPCがルートとレスポンスの型を保持できるようにする。
  return app
    .use("/api/v1/*", createAuthMiddleware(authUseCase))
    .get("/health", ...healthHandler.get)
    .post("/api/v1/auth/line", ...authHandler.line)
    .get("/api/v1/auth/session", ...authHandler.session)
    .post("/api/v1/auth/logout", ...authHandler.logout)
    .put("/api/v1/users/me", ...userHandler.updateProfile)
    .post("/api/v1/concerns", ...concernHandler.create);
}

export type AppType = ReturnType<typeof createApp>;
