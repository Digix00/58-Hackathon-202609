import { Hono } from "hono";
import { cors } from "hono/cors";

import type { IAuthUseCase } from "../application/usecase/auth.usecase";
import type { AuthHandler } from "../presentation/auth.handler";
import type { ClusterHandler } from "../presentation/cluster.handler";
import type { ConcernHandler } from "../presentation/concern.handler";
import type { ConcernReactionHandler } from "../presentation/concern-reaction.handler";
import type { ConcernViewHandler } from "../presentation/concern-view.handler";
import type { HealthHandler } from "../presentation/health.handler";
import type { HistoryHandler } from "../presentation/history.handler";
import type { LineHandler } from "../presentation/line.handler";
import type { QuizHandler } from "../presentation/quiz.handler";
import type { SpeechHandler } from "../presentation/speech.handler";
import type { UserHandler } from "../presentation/user.handler";
import type { Bindings } from "../types";
import { handleError } from "./error-handler";
import { requireAllowedAdminOrigin } from "./middleware/admin-origin";
import { createAuthMiddleware } from "./middleware/auth";
import { requireCloudflareAccess } from "./middleware/cloudflare-access";
import { requestLogger } from "./middleware/request-logger";

export interface ApplicationDependencies {
  authHandler: AuthHandler;
  authUseCase: IAuthUseCase;
  concernHandler: ConcernHandler;
  clusterHandler: ClusterHandler;
  concernReactionHandler: ConcernReactionHandler;
  concernViewHandler: ConcernViewHandler;
  healthHandler: HealthHandler;
  historyHandler: HistoryHandler;
  lineHandler?: LineHandler;
  quizHandler: QuizHandler;
  speechHandler: SpeechHandler;
  userHandler: UserHandler;
}

type AppEnvironment = {
  Bindings: Bindings;
  Variables: {
    auth: Awaited<ReturnType<IAuthUseCase["getSession"]>>;
  };
};

type DependenciesWithLineHandler = ApplicationDependencies & {
  lineHandler: LineHandler;
};

/** DI済みの画面向けハンドラーをルートへ接続する。 */
function createPublicApp({
  authHandler,
  authUseCase,
  concernHandler,
  clusterHandler,
  concernReactionHandler,
  concernViewHandler,
  healthHandler,
  historyHandler,
  quizHandler,
  speechHandler,
  userHandler,
}: ApplicationDependencies) {
  const app = new Hono<AppEnvironment>();

  app.use("*", requestLogger);
  app.use("*", (c, next) => {
    const origin = c.env.CORS_ORIGIN?.trim();
    return cors({
      origin: () => origin || "*",
      credentials: Boolean(origin),
      exposeHeaders: ["Retry-After", "X-Request-Id"],
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
    .put(
      "/api/v1/users/me/display-language",
      ...userHandler.updateDisplaySettings,
    )
    .get("/api/v1/history/summary", ...historyHandler.getSummary)
    .get("/api/v1/history/quiz-answers", ...historyHandler.getQuizAnswers)
    .get("/api/v1/history/concerns", ...historyHandler.getConcerns)
    .get("/api/v1/history/reactions", ...historyHandler.getReactions)
    .get("/api/v1/concerns", ...concernHandler.list)
    .get("/api/v1/clusters", ...clusterHandler.list)
    .get(
      "/api/v1/clusters/:clusterId/concerns",
      ...clusterHandler.requirePublished,
      ...concernHandler.list,
    )
    .post("/api/v1/concerns", ...concernHandler.create)
    .get("/api/v1/concerns/:concernId", ...concernHandler.detail)
    .post(
      "/api/v1/concerns/:concernId/reactions",
      ...concernReactionHandler.register,
    )
    .delete(
      "/api/v1/concerns/:concernId/reactions",
      ...concernReactionHandler.remove,
    )
    .post("/api/v1/concerns/:concernId/views", ...concernViewHandler.record)
    .get("/api/v1/quizzes/today", ...quizHandler.getToday)
    .get("/api/v1/quizzes/:quizId", ...quizHandler.getById)
    .post("/api/v1/quizzes/:quizId/answers", ...quizHandler.answer)
    .post("/api/v1/speech/transcriptions", ...speechHandler.transcribe);

  return publicApp;
}

/**
 * 管理画面用 API を RPC 型に含める。Webhook と内部配信 API は実行時だけ登録し、
 * 画面向け AppType には含めない。
 */
function createAppWithLineHandler({
  lineHandler,
  ...dependencies
}: DependenciesWithLineHandler) {
  const app = createPublicApp(dependencies)
    .get(
      "/api/v1/admin/line/broadcasts/daily-quiz",
      requireCloudflareAccess,
      ...lineHandler.adminStatus,
    )
    .post(
      "/api/v1/admin/line/broadcasts/daily-quiz",
      requireCloudflareAccess,
      requireAllowedAdminOrigin,
      ...lineHandler.adminTrigger,
    );

  // Hono は同じインスタンスへルートを追加する。戻り値を app に代入しないことで、
  // 外部・内部連携専用ルートを画面向け RPC 型から除外したまま登録する。
  app
    .post("/api/v1/webhooks/line", ...lineHandler.webhook)
    .post(
      "/api/v1/line/broadcasts/daily-quiz",
      ...lineHandler.internalBroadcast,
    );

  return app;
}

export function createApp(
  dependencies: DependenciesWithLineHandler,
): ReturnType<typeof createAppWithLineHandler>;
export function createApp(
  dependencies: Omit<ApplicationDependencies, "lineHandler">,
): ReturnType<typeof createPublicApp>;
/** DI済みのハンドラーをルートへ接続し、Honoアプリケーションを構築する。 */
export function createApp(dependencies: ApplicationDependencies) {
  if (dependencies.lineHandler) {
    return createAppWithLineHandler({
      ...dependencies,
      lineHandler: dependencies.lineHandler,
    });
  }

  return createPublicApp(dependencies);
}

export type AppType = ReturnType<typeof createAppWithLineHandler>;
