import { deleteCookie, getCookie } from "hono/cookie";
import { createFactory } from "hono/factory";
import { z } from "zod";
import {
  DEFAULT_SESSION_MAX_AGE_SECONDS,
  SESSION_COOKIE_NAME,
  setSessionCookie,
} from "../app/auth-cookie";
import type { AuthVariables } from "../app/middleware/auth";
import { getRequestId } from "../app/request-id";
import { isUserProfileCompleted, type User } from "../application/entity/user";
import {
  InvalidLineTokenError,
  LineAuthConfigurationError,
} from "../application/port/line-token-verifier";
import type { IAuthUseCase } from "../application/usecase/auth.usecase";
import type { Bindings } from "../types";

const lineLoginRequest = z.object({
  idToken: z.string().min(1).max(4096),
});
const devLoginRequest = z.object({
  userKey: z.enum(["demo-a", "demo-b", "demo-c"]),
});

const factory = createFactory<{
  Bindings: Bindings;
  Variables: AuthVariables;
}>();

export class AuthHandler {
  private readonly authUseCase: IAuthUseCase;
  private readonly sessionMaxAgeSeconds: number;

  constructor(
    authUseCase: IAuthUseCase,
    sessionMaxAgeSeconds = DEFAULT_SESSION_MAX_AGE_SECONDS,
  ) {
    this.authUseCase = authUseCase;
    this.sessionMaxAgeSeconds = Number.isFinite(sessionMaxAgeSeconds)
      ? Math.max(60, Math.floor(sessionMaxAgeSeconds))
      : DEFAULT_SESSION_MAX_AGE_SECONDS;
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
      getCookie(c, SESSION_COOKIE_NAME),
    );
    if (result.token) {
      setSessionCookie(c, result.token, this.sessionMaxAgeSeconds);
    }

    return c.json(toResponse(result));
  });

  readonly session = factory.createHandlers(async (c) => {
    setRequestId(c);

    // 認証ミドルウェアが既にセッションを解決している(通常のCookie復元、
    // またはDEV_AUTH_ENABLEDによる自動ログイン)場合はその結果をそのまま返す。
    // ここで getOrCreateSession を取り直すと、ミドルウェアが発行した
    // Cookie/認証結果を匿名セッションで上書きしてしまう。
    const resolved = c.var.auth;
    if (resolved?.user) {
      return c.json(toResponse(resolved));
    }

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

function toResponse(result: { user: User | null }) {
  return {
    authenticated: result.user !== null,
    user: result.user ? toUserResponse(result.user) : null,
  };
}

function toUserResponse(user: User) {
  return {
    id: user.id,
    displayLanguage: user.displayLanguage,
    birthYear: user.birthYear,
    birthMonth: user.birthMonth,
    gender: user.gender,
    regionCode: user.regionCode,
    profileCompleted: isUserProfileCompleted(user),
  };
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}
