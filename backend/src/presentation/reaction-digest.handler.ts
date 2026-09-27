import type { Context } from "hono";
import { createFactory } from "hono/factory";

import { hasValidInternalToken } from "../app/middleware/cloudflare-access";
import { getRequestId } from "../app/request-id";
import type { ReactionDigestRun } from "../application/entity/reaction-digest.entity";
import {
  ReactionDigestConfigurationError,
  type ReactionDigestExecution,
  type ReactionDigestUseCase,
} from "../application/usecase/reaction-digest.usecase";
import type { Bindings } from "../types";

const factory = createFactory<{ Bindings: Bindings }>();

/** 寄りそい通知の内部 API と、Access 保護された管理 API の HTTP 境界。 */
export class ReactionDigestHandler {
  private readonly useCase: ReactionDigestUseCase;

  constructor(useCase: ReactionDigestUseCase) {
    this.useCase = useCase;
  }

  readonly adminStatus = factory.createHandlers(async (c) => {
    setRequestId(c);
    const runs = await this.useCase.getRecentRuns();
    return c.json(
      {
        deliveryMode: this.useCase.deliveryMode,
        runs: runs.map(toRunResponse),
      },
      200,
    );
  });

  readonly adminTrigger = factory.createHandlers(async (c) => {
    const requestId = setRequestId(c);
    return this.runManual(c, requestId);
  });

  readonly internalRun = factory.createHandlers(async (c) => {
    const requestId = setRequestId(c);
    if (!c.env.INTERNAL_API_TOKEN) {
      return apiError(
        c,
        requestId,
        503,
        "INTERNAL_API_NOT_CONFIGURED",
        "内部配信APIが設定されていません",
      );
    }
    if (
      !hasValidInternalToken(
        c.req.header("authorization"),
        c.env.INTERNAL_API_TOKEN,
      )
    ) {
      return apiError(
        c,
        requestId,
        401,
        "AUTHENTICATION_REQUIRED",
        "内部認証が必要です",
      );
    }
    return this.runManual(c, requestId);
  });

  private async runManual(
    c: Context<{ Bindings: Bindings }>,
    requestId: string,
  ) {
    let result: ReactionDigestExecution;
    try {
      result = await this.useCase.runManual();
    } catch (error) {
      if (error instanceof ReactionDigestConfigurationError) {
        return apiError(
          c,
          requestId,
          503,
          "LINE_INTEGRATION_NOT_CONFIGURED",
          "LINE配信の設定がありません",
        );
      }
      throw error;
    }

    if (result.status === "in_progress") {
      return apiError(
        c,
        requestId,
        409,
        "REACTION_DIGEST_IN_PROGRESS",
        "寄りそい通知はすでに送信中です",
      );
    }
    const body = {
      deliveryMode: this.useCase.deliveryMode,
      run: toRunResponse(result.run),
    };
    // 送信しきれなかった delivery が残る場合は 202 を返し、続きの実行を促す。
    return result.status === "pending" ? c.json(body, 202) : c.json(body, 200);
  }
}

function toRunResponse(run: ReactionDigestRun) {
  return {
    runId: run.runId,
    trigger: run.trigger,
    status: run.status,
    requestedAt: run.requestedAt,
    finishedAt: run.finishedAt,
    targetCount: run.targetCount,
    sentCount: run.sentCount,
    failedCount: run.failedCount,
    skippedCount: run.skippedCount,
    remainingCount: run.remainingCount,
  };
}

function apiError(
  c: Context<{ Bindings: Bindings }>,
  requestId: string,
  status: 401 | 409 | 503,
  code: string,
  message: string,
) {
  return c.json({ error: { code, message, requestId } }, status);
}

function setRequestId(c: {
  header(name: string, value: string): void;
  req: { raw: Request };
}): string {
  const requestId = getRequestId(c.req.raw);
  c.header("X-Request-Id", requestId);
  return requestId;
}
