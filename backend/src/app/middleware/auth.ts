import { getCookie } from "hono/cookie";
import type { MiddlewareHandler } from "hono";

import type { AuthService } from "../../application/auth/auth.service";
import { SESSION_COOKIE_NAME } from "../../presentation/auth.handler";
import type { Bindings } from "../../types";

export type AuthVariables = {
  auth: Awaited<ReturnType<AuthService["getSession"]>>;
};

export function createAuthMiddleware(
  authService: AuthService,
): MiddlewareHandler<{ Bindings: Bindings; Variables: AuthVariables }> {
  return async (c, next) => {
    const auth = await authService.getSession(
      getCookie(c, SESSION_COOKIE_NAME),
    );
    c.set("auth", auth);
    await next();
  };
}
