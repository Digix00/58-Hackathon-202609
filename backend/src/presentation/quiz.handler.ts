import type { Context } from "hono";
import { createFactory } from "hono/factory";
import { z } from "zod";

import type { AuthVariables } from "../app/middleware/auth";
import { getRequestId } from "../app/request-id";
import {
  type Quiz,
  QuizAlreadyAnsweredError,
  QuizNotAvailableError,
  QuizValidationError,
} from "../application/entity/quiz";
import type { IQuizUseCase } from "../application/usecase/quiz.usecase";
import type { Bindings } from "../types";

const quizQuery = z
  .object({
    language: z.enum(["original", "jaHira", "en"]).default("original"),
  })
  .strict();

const answerRequest = z
  .object({
    matches: z
      .array(
        z
          .object({
            participantId: z.string().min(1),
            concernId: z.string().min(1),
          })
          .strict(),
      )
      .length(3),
  })
  .strict();

const factory = createFactory<{
  Bindings: Bindings;
  Variables: AuthVariables;
}>();
type QuizContext = Context<{
  Bindings: Bindings;
  Variables: AuthVariables;
}>;

export class QuizHandler {
  private readonly quizUseCase: IQuizUseCase;

  constructor(quizUseCase: IQuizUseCase) {
    this.quizUseCase = quizUseCase;
  }

  readonly getToday = factory.createHandlers(async (c) => {
    const requestId = setRequestId(c);
    const auth = c.var.auth;
    if (!auth?.user) {
      return authenticationRequired(c, requestId);
    }

    const parsed = quizQuery.safeParse(c.req.query());
    if (!parsed.success) {
      return invalidRequest(c, requestId, parsed.error.issues);
    }

    const quiz = await this.quizUseCase.getToday(auth.user.id);
    if (!quiz) {
      return quizNotAvailable(c, requestId);
    }

    return c.json(toResponse(quiz));
  });

  readonly getById = factory.createHandlers(async (c) => {
    const requestId = setRequestId(c);
    const auth = c.var.auth;
    if (!auth?.user) {
      return authenticationRequired(c, requestId);
    }

    const parsed = quizQuery.safeParse(c.req.query());
    if (!parsed.success) {
      return invalidRequest(c, requestId, parsed.error.issues);
    }

    const quizId = c.req.param("quizId");
    if (!quizId) {
      return quizNotAvailable(c, requestId);
    }

    const quiz = await this.quizUseCase.getById(quizId, auth.user.id);
    if (!quiz) {
      return quizNotAvailable(c, requestId);
    }

    return c.json(toResponse(quiz));
  });

  readonly answer = factory.createHandlers(async (c) => {
    const requestId = setRequestId(c);
    const auth = c.var.auth;
    if (!auth?.user) {
      return authenticationRequired(c, requestId);
    }

    const quizId = c.req.param("quizId");
    if (!quizId) {
      return quizNotAvailable(c, requestId);
    }

    const parsed = answerRequest.safeParse(await readJson(c.req.raw));
    if (!parsed.success) {
      return invalidRequest(c, requestId, parsed.error.issues);
    }

    try {
      const result = await this.quizUseCase.answer({
        quizId,
        userId: auth.user.id,
        matches: parsed.data.matches,
      });
      return c.json(result, 201);
    } catch (error) {
      if (error instanceof QuizValidationError) {
        return c.json(
          {
            error: {
              code: "INVALID_REQUEST",
              message: "回答内容を確認してください",
              details: [{ field: error.field, reason: "invalid" }],
              requestId,
            },
          },
          400,
        );
      }
      if (error instanceof QuizAlreadyAnsweredError) {
        return c.json(
          {
            error: {
              code: "QUIZ_ALREADY_ANSWERED",
              message: "このクイズは回答済みです",
              requestId,
            },
          },
          409,
        );
      }
      if (error instanceof QuizNotAvailableError) {
        return quizNotAvailable(c, requestId);
      }
      throw error;
    }
  });
}

function toResponse(quiz: Quiz) {
  const participants = shuffle(quiz.participants).map((participant, index) => ({
    participantId: participant.id,
    attributes: {
      ageGroup: participant.ageGroup ?? "no_answer",
      gender: participant.gender ?? "no_answer",
      regionCode: participant.regionCode ?? "no_answer",
    },
    displayOrder: index + 1,
  }));
  const concerns = shuffle(quiz.options).map((option, index) => ({
    concernId: option.concernId,
    body: option.body,
    language: "original" as const,
    displayOrder: index + 1,
  }));

  return {
    id: quiz.id,
    quizDate: quiz.quizDate,
    participants,
    concerns,
    answered: Boolean(quiz.answerResult),
    ...(quiz.answerResult ? { answerResult: quiz.answerResult } : {}),
  };
}

function shuffle<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function setRequestId(c: {
  header(name: string, value: string): void;
  req: { raw: Request };
}): string {
  const requestId = getRequestId(c.req.raw);
  c.header("X-Request-Id", requestId);
  return requestId;
}

function authenticationRequired(c: QuizContext, requestId: string) {
  return c.json(
    {
      error: {
        code: "AUTHENTICATION_REQUIRED",
        message: "クイズにはLINEログインが必要です",
        requestId,
      },
    },
    401,
  );
}

function quizNotAvailable(c: QuizContext, requestId: string) {
  return c.json(
    {
      error: {
        code: "QUIZ_NOT_AVAILABLE",
        message: "今日のクイズは利用できません",
        requestId,
      },
    },
    404,
  );
}

function invalidRequest(
  c: QuizContext,
  requestId: string,
  issues: readonly { path: PropertyKey[]; code: string }[],
) {
  return c.json(
    {
      error: {
        code: "INVALID_REQUEST",
        message: "入力内容を確認してください",
        details: issues.map((issue) => ({
          field: issue.path.map(String).join(".") || "body",
          reason: issue.code,
        })),
        requestId,
      },
    },
    400,
  );
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}
