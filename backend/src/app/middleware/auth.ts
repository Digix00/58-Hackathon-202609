import { getCookie } from "hono/cookie";
import type { MiddlewareHandler } from "hono";

import type { AuthUseCase } from "../../application/usecase/auth.usecase";
import { SESSION_COOKIE_NAME } from "../../presentation/auth.handler";
import type { Bindings } from "../../types";

export type AuthVariables = {
  auth: Awaited<ReturnType<AuthUseCase["getSession"]>>;
};

export function createAuthMiddleware(
  authUseCase: AuthUseCase,
): MiddlewareHandler<{ Bindings: Bindings; Variables: AuthVariables }> {
  return async (c, next) => {
    const auth = await authUseCase.getSession(
      getCookie(c, SESSION_COOKIE_NAME),
    );
    c.set("auth", auth);
    await next();
  };
}
