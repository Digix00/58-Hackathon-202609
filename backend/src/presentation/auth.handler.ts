import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { createFactory } from "hono/factory";
import { z } from "zod";
import { getSessionCookieSettings } from "../app/auth-cookie";
import { getRequestId } from "../app/request-id";
import type { User } from "../application/entity/user";
import {
  InvalidLineTokenError,
  LineAuthConfigurationError,
} from "../application/port/line-token-verifier";
import type { IAuthUseCase } from "../application/usecase/auth.usecase";
import type { Bindings } from "../types";
import { toUserResponse } from "./user-response";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const lineLoginRequest = z.object({
  idToken: z.string().min(1).max(4096),
});
const devLoginRequest = z.object({
  userKey: z.enum(["demo-a", "demo-b", "demo-c"]),
});

const factory = createFactory<{ Bindings: Bindings }>();
type AuthContext = Context<{ Bindings: Bindings }>;

export class AuthHandler {
  private readonly authUseCase: IAuthUseCase;
  private readonly sessionMaxAgeSeconds: number;

  constructor(
    authUseCase: IAuthUseCase,
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
        getSessionToken(c),
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
      throw error;
    }
  });

  readonly dev = factory.createHandlers(async (c) => {
    const requestId = setRequestId(c);
    if (c.env.DEV_AUTH_ENABLED !== "true") {
      return c.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "Not found",
            requestId,
          },
        },
        404,
      );
    }

    const parsed = devLoginRequest.safeParse(await readJson(c.req.raw));
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "INVALID_REQUEST",
            message: "開発用ユーザーを指定してください",
            requestId,
          },
        },
        400,
      );
    }

    const result = await this.authUseCase.authenticateWithIdentity(
      { lineUserId: `dev:${parsed.data.userKey}` },
      getSessionToken(c),
    );
    if (result.token) {
      setSessionCookie(c, result.token, this.sessionMaxAgeSeconds);
    }

    return c.json(toResponse(result));
  });

  readonly session = factory.createHandlers(async (c) => {
    setRequestId(c);
    const result = await this.authUseCase.getOrCreateSession(
      getSessionToken(c),
    );
    if (result.token) {
      setSessionCookie(c, result.token, this.sessionMaxAgeSeconds);
    }

    return c.json(toResponse(result));
  });

  readonly logout = factory.createHandlers(async (c) => {
    setRequestId(c);
    await this.authUseCase.logout(getSessionToken(c));
    const cookie = getSessionCookieSettings(c.req.url, c.env);
    deleteCookie(c, cookie.name, cookie.options);
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

function getSessionToken(c: AuthContext): string | undefined {
  return getCookie(c, getSessionCookieSettings(c.req.url, c.env).name);
}

function setSessionCookie(c: AuthContext, token: string, maxAge: number): void {
  const cookie = getSessionCookieSettings(c.req.url, c.env);
  setCookie(c, cookie.name, token, {
    ...cookie.options,
    maxAge,
  });
}

function toResponse(result: { user: User | null }) {
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
