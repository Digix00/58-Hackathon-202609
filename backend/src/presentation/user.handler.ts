import { createFactory } from "hono/factory";
import { z } from "zod";

import type { AuthVariables } from "../app/middleware/auth";
import { getRequestId } from "../app/request-id";
import {
  DisplayLanguageValidationError,
  type UserProfileInput,
  UserProfileValidationError,
} from "../application/entity/user";
import type { IUserUseCase } from "../application/usecase/user.usecase";
import type { Bindings } from "../types";
import { toUserResponse } from "./user-response";

const updateUserProfileRequest = z.object({
  birthYear: z.number().int(),
  birthMonth: z.number().int(),
  gender: z.string(),
  regionCode: z.string(),
});
const updateDisplayLanguageRequest = z.object({
  displayLanguage: z.string(),
});

const factory = createFactory<{
  Bindings: Bindings;
  Variables: AuthVariables;
}>();

export class UserHandler {
  private readonly userUseCase: IUserUseCase;

  constructor(userUseCase: IUserUseCase) {
    this.userUseCase = userUseCase;
  }

  readonly updateProfile = factory.createHandlers(async (c) => {
    const requestId = setRequestId(c);
    const auth = c.var.auth;
    if (!auth?.user) {
      return c.json(
        {
          error: {
            code: "AUTHENTICATION_REQUIRED",
            message: "ユーザー情報の更新にはLINEログインが必要です",
            requestId,
          },
        },
        401,
      );
    }

    const parsed = updateUserProfileRequest.safeParse(
      await readJson(c.req.raw),
    );
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "INVALID_REQUEST",
            message: "ユーザー情報を確認してください",
            details: parsed.error.issues.map((issue) => ({
              field: issue.path.join(".") || "body",
              reason: issue.code,
            })),
            requestId,
          },
        },
        400,
      );
    }

    try {
      const user = await this.userUseCase.updateProfile(
        auth.user.id,
        parsed.data as UserProfileInput,
      );

      return c.json({ authenticated: true, user: toUserResponse(user) });
    } catch (error) {
      if (error instanceof UserProfileValidationError) {
        return c.json(
          {
            error: {
              code: "INVALID_REQUEST",
              message: "ユーザー情報を確認してください",
              details: [{ field: error.field, reason: "invalid" }],
              requestId,
            },
          },
          400,
        );
      }
      throw error;
    }
  });

  readonly updateDisplayLanguage = factory.createHandlers(async (c) => {
    const requestId = setRequestId(c);
    const auth = c.var.auth;
    if (!auth?.user) {
      return c.json(
        {
          error: {
            code: "AUTHENTICATION_REQUIRED",
            message: "表示形式の更新にはLINEログインが必要です",
            requestId,
          },
        },
        401,
      );
    }

    const parsed = updateDisplayLanguageRequest.safeParse(
      await readJson(c.req.raw),
    );
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "INVALID_REQUEST",
            message: "表示形式を確認してください",
            details: parsed.error.issues.map((issue) => ({
              field: issue.path.join(".") || "body",
              reason: issue.code,
            })),
            requestId,
          },
        },
        400,
      );
    }

    try {
      const user = await this.userUseCase.updateDisplayLanguage(
        auth.user.id,
        parsed.data.displayLanguage,
      );
      return c.json({ authenticated: true, user: toUserResponse(user) });
    } catch (error) {
      if (error instanceof DisplayLanguageValidationError) {
        return c.json(
          {
            error: {
              code: "INVALID_REQUEST",
              message: "表示形式を確認してください",
              details: [{ field: "displayLanguage", reason: "invalid" }],
              requestId,
            },
          },
          400,
        );
      }
      throw error;
    }
  });
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
