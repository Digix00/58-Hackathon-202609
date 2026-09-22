import { createFactory } from "hono/factory";
import { z } from "zod";

import type { AuthVariables } from "../app/middleware/auth";
import { getRequestId } from "../app/request-id";
import {
  UserProfileValidationError,
  type UserProfilePatch,
} from "../application/entity/user";
import {
  UserNotFoundError,
  type UserUseCasePort,
} from "../application/usecase/user.usecase";
import type { Bindings } from "../types";
import { toUserResponse } from "./user-response";

const updateProfileRequest = z
  .object({
    birthYear: z.number().int().nullable().optional(),
    gender: z.string().nullable().optional(),
    regionCode: z.string().nullable().optional(),
  })
  .strict();

const factory = createFactory<{
  Bindings: Bindings;
  Variables: AuthVariables;
}>();

export class UserHandler {
  private readonly userUseCase: UserUseCasePort;

  constructor(userUseCase: UserUseCasePort) {
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
            message: "LINEログインが必要です",
            requestId,
          },
        },
        401,
      );
    }

    const body = await readJson(c.req.raw);
    const parsed = updateProfileRequest.safeParse(body);
    if (!parsed.success || Object.keys(parsed.data).length === 0) {
      return c.json(
        {
          error: {
            code: "INVALID_REQUEST",
            message: "プロフィール情報を1つ以上指定してください",
            requestId,
          },
        },
        400,
      );
    }

    try {
      const user = await this.userUseCase.updateProfile(
        auth.user.id,
        parsed.data as UserProfilePatch,
      );
      return c.json(toUserResponse(user));
    } catch (error) {
      if (error instanceof UserProfileValidationError) {
        return c.json(
          {
            error: {
              code: "INVALID_REQUEST",
              message: "プロフィール情報を確認してください",
              details: [{ field: error.field, reason: "invalid" }],
              requestId,
            },
          },
          400,
        );
      }
      if (error instanceof UserNotFoundError) {
        return c.json(
          {
            error: {
              code: "USER_NOT_FOUND",
              message: "ユーザーが見つかりません",
              requestId,
            },
          },
          404,
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
