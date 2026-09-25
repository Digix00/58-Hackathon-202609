import type { Context } from "hono";
import { createFactory } from "hono/factory";
import { z } from "zod";

import { hasValidInternalToken } from "../app/middleware/cloudflare-access";
import { getRequestId } from "../app/request-id";
import type {
  DailyBroadcastExecution,
  LineUseCase,
} from "../application/usecase/line.usecase";
import {
  InvalidLineSignatureError,
  InvalidLineWebhookPayloadError,
  LineIntegrationConfigurationError,
} from "../application/usecase/line.usecase";
import type { Bindings } from "../types";

const factory = createFactory<{ Bindings: Bindings }>();
const broadcastRequest = z.object({ quizId: z.string().min(1) }).strict();
const quizDateQuery = z.object({
  quizDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

/** LINE Webhook、内部配信、Access 保護された管理 API の HTTP 境界。 */
export class LineHandler {
  private readonly lineUseCase: LineUseCase;

  constructor(lineUseCase: LineUseCase) {
    this.lineUseCase = lineUseCase;
  }

  readonly webhook = factory.createHandlers(async (c) => {
    const requestId = setRequestId(c);
    const rawBody = new Uint8Array(await c.req.raw.arrayBuffer());
    try {
      await this.lineUseCase.receiveWebhook(
        rawBody,
        c.req.header("x-line-signature") ?? null,
      );
      return c.json({ accepted: true }, 200);
    } catch (error) {
      if (error instanceof InvalidLineSignatureError) {
        return apiError(
          c,
          requestId,
          401,
          "INVALID_LINE_SIGNATURE",
          "LINE署名を確認できません",
        );
      }
      if (error instanceof InvalidLineWebhookPayloadError) {
        return apiError(
          c,
          requestId,
          400,
          "INVALID_REQUEST",
          "Webhookの内容を確認できません",
        );
      }
      throw error;
    }
  });

  readonly internalBroadcast = factory.createHandlers(async (c) => {
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

    const parsed = broadcastRequest.safeParse(await readJson(c.req.raw));
    if (!parsed.success) {
      return apiError(
        c,
        requestId,
        400,
        "INVALID_REQUEST",
        "quizIdを指定してください",
      );
    }

    try {
      const result = await this.lineUseCase.executeDailyBroadcast(
        parsed.data.quizId,
      );
      return internalExecutionResponse(
        c,
        requestId,
        result,
        this.lineUseCase.deliveryMode,
      );
    } catch (error) {
      if (error instanceof LineIntegrationConfigurationError) {
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
  });

  readonly adminStatus = factory.createHandlers(async (c) => {
    const requestId = setRequestId(c);
    const parsed = quizDateQuery.safeParse(c.req.query());
    if (!parsed.success) {
      return apiError(
        c,
        requestId,
        400,
        "INVALID_REQUEST",
        "quizDateを確認してください",
      );
    }
    const view = await this.lineUseCase.getDailyBroadcast(parsed.data.quizDate);
    return c.json(
      { ...view, deliveryMode: this.lineUseCase.deliveryMode },
      200,
    );
  });

  readonly adminTrigger = factory.createHandlers(async (c) => {
    const requestId = setRequestId(c);
    try {
      const result = await this.lineUseCase.triggerDailyRun();
      if (result.status === "quiz_not_available") {
        return c.json(
          {
            error: {
              code: "QUIZ_NOT_AVAILABLE",
              message: "今日の公開クイズを用意できませんでした",
              requestId,
            },
            status: {
              ...result.view,
              deliveryMode: this.lineUseCase.deliveryMode,
            },
          },
          409,
        );
      }
      return adminExecutionResponse(
        c,
        requestId,
        {
          status: result.status,
          broadcastId: null,
          view: result.view,
        },
        this.lineUseCase.deliveryMode,
      );
    } catch (error) {
      if (error instanceof LineIntegrationConfigurationError) {
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
  });
}

function internalExecutionResponse(
  c: Context<{ Bindings: Bindings }>,
  requestId: string,
  result: DailyBroadcastExecution,
  deliveryMode: "line_api" | "simulation",
) {
  if (result.status === "succeeded") {
    return c.json(
      {
        broadcastId: result.broadcastId,
        quizId: result.view?.quizId ?? null,
        quizDate: result.view?.quizDate,
        status: "succeeded",
        deliveryMode,
        requestedAt: result.view?.requestedAt ?? null,
        sentAt: result.view?.sentAt ?? null,
      },
      200,
    );
  }
  if (result.status === "in_progress") {
    return apiError(
      c,
      requestId,
      409,
      "BROADCAST_IN_PROGRESS",
      "今日の配信処理はすでに実行中です",
    );
  }
  if (result.status === "not_available") {
    return apiError(
      c,
      requestId,
      404,
      "QUIZ_NOT_AVAILABLE",
      "配信できる公開クイズがありません",
    );
  }
  return apiError(
    c,
    requestId,
    503,
    "BROADCAST_UPSTREAM_UNAVAILABLE",
    "LINEへの配信を確認できませんでした",
  );
}

function adminExecutionResponse(
  c: Context<{ Bindings: Bindings }>,
  requestId: string,
  result: DailyBroadcastExecution,
  deliveryMode: "line_api" | "simulation",
) {
  if (result.status === "succeeded") {
    return c.json({ ...result.view, deliveryMode }, 200);
  }
  if (result.status === "in_progress") {
    return c.json({ ...result.view, deliveryMode }, 202);
  }
  if (result.status === "not_available") {
    return apiError(
      c,
      requestId,
      404,
      "QUIZ_NOT_AVAILABLE",
      "配信できる公開クイズがありません",
    );
  }
  return apiError(
    c,
    requestId,
    503,
    "BROADCAST_UPSTREAM_UNAVAILABLE",
    "LINEへの配信を確認できませんでした",
  );
}

function apiError(
  c: Context<{ Bindings: Bindings }>,
  requestId: string,
  status: 400 | 401 | 404 | 409 | 503,
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

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}
