import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { createFactory } from "hono/factory";
import { z } from "zod";

import type { AuthUseCasePort } from "../application/usecase/auth.usecase";
import {
  InvalidLineTokenError,
  LineAuthConfigurationError,
} from "../application/port/line-token-verifier";
import {
  UserProfileValidationError,
  type UserProfilePatch,
} from "../application/entity/user";
import { getRequestId } from "../app/request-id";
import { SESSION_COOKIE_NAME } from "../app/auth-cookie";
import type { Bindings } from "../types";
import { toUserResponse } from "./user-response";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const userProfileRequest = z
  .object({
    birthYear: z.number().int().nullable().optional(),
    gender: z.string().nullable().optional(),
    regionCode: z.string().nullable().optional(),
  })
  .strict();
const lineLoginRequest = z.object({
  idToken: z.string().min(1).max(4096),
  profile: userProfileRequest.optional(),
});

const factory = createFactory<{ Bindings: Bindings }>();

export class AuthHandler {
  private readonly authUseCase: AuthUseCasePort;
  private readonly sessionMaxAgeSeconds: number;

  constructor(
    authUseCase: AuthUseCasePort,
    sessionMaxAgeSeconds = SESSION_MAX_AGE_SECONDS,
  ) {
    this.authUseCase = authUseCase;
    this.sessionMaxAgeSeconds = Number.isFinite(sessionMaxAgeSeconds)
      ? Math.max(60, Math.floor(sessionMaxAgeSeconds))
      : SESSION_MAX_AGE_SECONDS;
  }

  readonly line = factory.createHandlers(async (c) => {
    const requestId = setRequestId(c);
    const body = await readJson(c.req.raw);
    const parsed = lineLoginRequest.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "INVALID_REQUEST",
            message: "idTokenを指定してください",
            requestId,
          },
        },
        400,
      );
    }

    try {
      const result = await this.authUseCase.authenticateWithLine(
        parsed.data.idToken,
        getCookie(c, SESSION_COOKIE_NAME),
        parsed.data.profile as UserProfilePatch | undefined,
      );
      if (result.token) {
        setSessionCookie(c, result.token, this.sessionMaxAgeSeconds);
      }

      return c.json(toResponse(result));
    } catch (error) {
      if (error instanceof InvalidLineTokenError) {
        return c.json(
          {
            error: {
              code: "INVALID_LINE_TOKEN",
              message: "LINE認証に失敗しました",
              requestId,
            },
          },
          401,
        );
      }
      if (error instanceof LineAuthConfigurationError) {
        return c.json(
          {
            error: {
              code: "AUTH_NOT_CONFIGURED",
              message: "LINE認証が設定されていません",
              requestId,
            },
          },
          503,
        );
      }
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
      throw error;
    }
  });

  readonly session = factory.createHandlers(async (c) => {
    setRequestId(c);
    const result = await this.authUseCase.getOrCreateSession(
      getCookie(c, SESSION_COOKIE_NAME),
    );
    if (result.token) {
      setSessionCookie(c, result.token, this.sessionMaxAgeSeconds);
    }

    return c.json(toResponse(result));
  });

  readonly logout = factory.createHandlers(async (c) => {
    setRequestId(c);
    await this.authUseCase.logout(getCookie(c, SESSION_COOKIE_NAME));
    deleteCookie(c, SESSION_COOKIE_NAME, { path: "/", secure: true });
    return c.json({ authenticated: false, user: null });
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

function setSessionCookie(
  c: Parameters<typeof setCookie>[0],
  token: string,
  maxAge: number,
): void {
  setCookie(c, SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge,
  });
}

function toResponse(result: {
  user: Parameters<typeof toUserResponse>[0] | null;
}) {
  return {
    authenticated: result.user !== null,
    user: result.user ? toUserResponse(result.user) : null,
  };
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}
