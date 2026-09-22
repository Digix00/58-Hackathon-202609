import { getCookie } from "hono/cookie";
import type { MiddlewareHandler } from "hono";

import type { AuthUseCasePort } from "../../application/usecase/auth.usecase";
import { SESSION_COOKIE_NAME } from "../auth-cookie";
import type { Bindings } from "../../types";

export type AuthVariables = {
  auth: Awaited<ReturnType<AuthUseCasePort["getSession"]>>;
};

export function createAuthMiddleware(
  authUseCase: AuthUseCasePort,
): MiddlewareHandler<{ Bindings: Bindings; Variables: AuthVariables }> {
  return async (c, next) => {
    const auth = await authUseCase.getSession(
      getCookie(c, SESSION_COOKIE_NAME),
    );
    c.set("auth", auth);
    await next();
  };
}
