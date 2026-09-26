import type { Context } from "hono";
import { createFactory } from "hono/factory";
import { z } from "zod";

import type { AuthVariables } from "../app/middleware/auth";
import { getRequestId } from "../app/request-id";
import type { IHistoryUseCase } from "../application/usecase/history.usecase";
import { HistoryUserDeletedError } from "../application/usecase/history.usecase";
import type { Bindings } from "../types";
import {
  getAgeGroupName,
  getGenderName,
  getRegionName,
} from "../util/attribute-name";
import {
  DISPLAY_LANGUAGES,
  type DisplayLanguage,
  resolveDisplayLanguage,
} from "../util/display-language";
import { decodeHistoryCursor, encodeHistoryCursor } from "./history-cursor";

const summaryQuery = z
  .object({ language: z.enum(DISPLAY_LANGUAGES).optional() })
  .strict();

const quizAnswersQuery = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().min(1).max(512).optional(),
  })
  .strict();

const factory = createFactory<{
  Bindings: Bindings;
  Variables: AuthVariables;
}>();
type HistoryContext = Context<{
  Bindings: Bindings;
  Variables: AuthVariables;
}>;

export class HistoryHandler {
  private readonly historyUseCase: IHistoryUseCase;

  constructor(historyUseCase: IHistoryUseCase) {
    this.historyUseCase = historyUseCase;
  }

  readonly getSummary = factory.createHandlers(async (c) => {
    const requestId = setRequestId(c);
    const user = c.var.auth?.user;
    if (!user) return authenticationRequired(c, requestId);

    const parsed = summaryQuery.safeParse(c.req.query());
    if (!parsed.success) {
      return invalidRequest(c, requestId, parsed.error.issues);
    }

    try {
      const summary = await this.historyUseCase.getSummary(user.id);
      return c.json(
        toSummaryResponse(
          summary,
          resolveDisplayLanguage(parsed.data.language, user.displayLanguage),
        ),
      );
    } catch (error) {
      if (error instanceof HistoryUserDeletedError) {
        return userDeleted(c, requestId);
      }
      throw error;
    }
  });

  readonly getQuizAnswers = factory.createHandlers(async (c) => {
    const requestId = setRequestId(c);
    const userId = c.var.auth?.user?.id;
    if (!userId) return authenticationRequired(c, requestId);

    const parsed = quizAnswersQuery.safeParse(c.req.query());
    if (!parsed.success) {
      return invalidRequest(c, requestId, parsed.error.issues);
    }

    const cursor = parsed.data.cursor
      ? decodeHistoryCursor(parsed.data.cursor)
      : null;
    if (parsed.data.cursor && !cursor) {
      return c.json(
        {
          error: {
            code: "INVALID_CURSOR",
            message: "履歴の続き位置を確認してください",
            details: [{ field: "cursor", reason: "invalid" }],
            requestId,
          },
        },
        400,
      );
    }

    try {
      const result = await this.historyUseCase.listQuizAnswers(
        userId,
        parsed.data.limit,
        cursor,
      );
      return c.json({
        items: result.items,
        nextCursor: result.nextCursor
          ? encodeHistoryCursor(result.nextCursor)
          : null,
      });
    } catch (error) {
      if (error instanceof HistoryUserDeletedError) {
        return userDeleted(c, requestId);
      }
      throw error;
    }
  });
}

/** 集計の属性コードに、表示形式に合わせたマスタ上の名称を添える。 */
function toSummaryResponse(
  summary: Awaited<ReturnType<IHistoryUseCase["getSummary"]>>,
  displayLanguage: DisplayLanguage,
) {
  return {
    ...summary,
    regions: summary.regions.map((region) => ({
      ...region,
      regionName: getRegionName(region.regionCode, displayLanguage),
    })),
    attributes: {
      ageGroups: summary.attributes.ageGroups.map((item) => ({
        ...item,
        ageGroupName: getAgeGroupName(item.ageGroup, displayLanguage),
      })),
      genders: summary.attributes.genders.map((item) => ({
        ...item,
        genderName: getGenderName(item.gender, displayLanguage),
      })),
    },
    nextSuggestion:
      summary.nextSuggestion?.kind === "region"
        ? {
            ...summary.nextSuggestion,
            regionName: getRegionName(
              summary.nextSuggestion.regionCode,
              displayLanguage,
            ),
          }
        : summary.nextSuggestion,
  };
}

function setRequestId(c: {
  header(name: string, value: string): void;
  req: { raw: Request };
}): string {
  const requestId = getRequestId(c.req.raw);
  c.header("X-Request-Id", requestId);
  return requestId;
}

function authenticationRequired(c: HistoryContext, requestId: string) {
  return c.json(
    {
      error: {
        code: "AUTHENTICATION_REQUIRED",
        message: "学習履歴の確認にはLINEログインが必要です",
        requestId,
      },
    },
    401,
  );
}

function userDeleted(c: HistoryContext, requestId: string) {
  return c.json(
    {
      error: {
        code: "USER_DELETED",
        message: "このアカウントでは学習履歴を確認できません",
        requestId,
      },
    },
    403,
  );
}

function invalidRequest(
  c: HistoryContext,
  requestId: string,
  issues: readonly { path: PropertyKey[]; code: string }[],
) {
  return c.json(
    {
      error: {
        code: "INVALID_REQUEST",
        message: "入力内容を確認してください",
        details: issues.map((issue) => ({
          field: issue.path.map(String).join(".") || "query",
          reason: issue.code,
        })),
        requestId,
      },
    },
    400,
  );
}
