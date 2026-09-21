import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { createFactory } from "hono/factory";
import { z } from "zod";

import { AuthService } from "../application/auth/auth.service";
import {
  InvalidLineTokenError,
  LineAuthConfigurationError,
} from "../application/auth/line-token-verifier";
import type { Bindings } from "../types";

export const SESSION_COOKIE_NAME = "__Host-session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const lineLoginRequest = z.object({
  idToken: z.string().min(1).max(4096),
});

const factory = createFactory<{ Bindings: Bindings }>();

export class AuthHandler {
  private readonly authService: AuthService;
  private readonly sessionMaxAgeSeconds: number;

  constructor(
    authService: AuthService,
    sessionMaxAgeSeconds = SESSION_MAX_AGE_SECONDS,
  ) {
    this.authService = authService;
    this.sessionMaxAgeSeconds = Number.isFinite(sessionMaxAgeSeconds)
      ? Math.max(60, Math.floor(sessionMaxAgeSeconds))
      : SESSION_MAX_AGE_SECONDS;
  }

  readonly line = factory.createHandlers(async (c) => {
    const body = await readJson(c.req.raw);
    const parsed = lineLoginRequest.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { code: "invalid_request", message: "idToken is required" },
        400,
      );
    }

    try {
      const result = await this.authService.authenticateWithLine(
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
          { code: "invalid_line_token", message: "LINE authentication failed" },
          401,
        );
      }
      if (error instanceof LineAuthConfigurationError) {
        return c.json(
          {
            code: "auth_not_configured",
            message: "LINE authentication is not configured",
          },
          503,
        );
      }
      throw error;
    }
  });

  readonly session = factory.createHandlers(async (c) => {
    const result = await this.authService.getOrCreateSession(
      getCookie(c, SESSION_COOKIE_NAME),
    );
    if (result.token) {
      setSessionCookie(c, result.token, this.sessionMaxAgeSeconds);
    }

    return c.json(toResponse(result));
  });

  readonly logout = factory.createHandlers(async (c) => {
    await this.authService.logout(getCookie(c, SESSION_COOKIE_NAME));
    deleteCookie(c, SESSION_COOKIE_NAME, { path: "/", secure: true });
    return c.json({ authenticated: false, user: null });
  });

  getService(): AuthService {
    return this.authService;
  }
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
  session: { userId: string | null };
  user: { id: string } | null;
}) {
  return {
    authenticated: result.session.userId !== null,
    user: result.user ? { id: result.user.id } : null,
  };
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}
