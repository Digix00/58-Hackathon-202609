import { Hono } from "hono";
import { cors } from "hono/cors";

import type { IAuthUseCase } from "../application/usecase/auth.usecase";
import type { AuthHandler } from "../presentation/auth.handler";
import type { ConcernHandler } from "../presentation/concern.handler";
import type { ConcernReactionHandler } from "../presentation/concern-reaction.handler";
import type { ConcernViewHandler } from "../presentation/concern-view.handler";
import type { HealthHandler } from "../presentation/health.handler";
import type { LineHandler } from "../presentation/line.handler";
import type { QuizHandler } from "../presentation/quiz.handler";
import type { UserHandler } from "../presentation/user.handler";
import type { Bindings } from "../types";
import { handleError } from "./error-handler";
import { createAuthMiddleware } from "./middleware/auth";
import { requireCloudflareAccess } from "./middleware/cloudflare-access";
import { requestLogger } from "./middleware/request-logger";

export interface ApplicationDependencies {
  authHandler: AuthHandler;
  authUseCase: IAuthUseCase;
  concernHandler: ConcernHandler;
  concernReactionHandler: ConcernReactionHandler;
  concernViewHandler: ConcernViewHandler;
  healthHandler: HealthHandler;
  lineHandler?: LineHandler;
  quizHandler: QuizHandler;
  userHandler: UserHandler;
}

/** DI済みのハンドラーをルートへ接続し、Honoアプリケーションを構築する。 */
export function createApp({
  authHandler,
  authUseCase,
  concernHandler,
  concernReactionHandler,
  concernViewHandler,
  healthHandler,
  lineHandler,
  quizHandler,
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
  const publicApp = app
    .use("/api/v1/*", createAuthMiddleware(authUseCase))
    .get("/health", ...healthHandler.get)
    .post("/api/v1/auth/line", ...authHandler.line)
    .post("/api/v1/auth/dev", ...authHandler.dev)
    .get("/api/v1/auth/session", ...authHandler.session)
    .post("/api/v1/auth/logout", ...authHandler.logout)
    .put("/api/v1/users/me", ...userHandler.updateProfile)
    .get("/api/v1/concerns", ...concernHandler.list)
    .post("/api/v1/concerns", ...concernHandler.create)
    .get("/api/v1/concerns/:concernId", ...concernHandler.detail)
    .post(
      "/api/v1/concerns/:concernId/reactions",
      ...concernReactionHandler.register,
    )
    .post("/api/v1/concerns/:concernId/views", ...concernViewHandler.record)
    .get("/api/v1/quizzes/today", ...quizHandler.getToday)
    .get("/api/v1/quizzes/:quizId", ...quizHandler.getById)
    .post("/api/v1/quizzes/:quizId/answers", ...quizHandler.answer);

  // 運用 API は実行時 app にだけ登録し、Hono RPC の AppType には公開しない。
  const runtimeApp = publicApp as Hono<{
    Bindings: Bindings;
    Variables: {
      auth: Awaited<ReturnType<IAuthUseCase["getSession"]>>;
    };
  }>;
  if (lineHandler) {
    runtimeApp
      .post("/api/v1/webhooks/line", ...lineHandler.webhook)
      .post(
        "/api/v1/line/broadcasts/daily-quiz",
        ...lineHandler.internalBroadcast,
      )
      .get(
        "/api/v1/admin/line/broadcasts/daily-quiz",
        requireCloudflareAccess,
        ...lineHandler.adminStatus,
      )
      .post(
        "/api/v1/admin/line/broadcasts/daily-quiz",
        requireCloudflareAccess,
        ...lineHandler.adminTrigger,
      );
  }

  return publicApp;
}

export type AppType = ReturnType<typeof createApp>;
