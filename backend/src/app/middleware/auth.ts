import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";

import type { IAuthUseCase } from "../../application/usecase/auth.usecase";
import type { Bindings } from "../../types";
import { SESSION_COOKIE_NAME } from "../auth-cookie";

export type AuthVariables = {
  auth: Awaited<ReturnType<IAuthUseCase["getSession"]>>;
};

export function createAuthMiddleware(
  authUseCase: IAuthUseCase,
): MiddlewareHandler<{ Bindings: Bindings; Variables: AuthVariables }> {
  return async (c, next) => {
    const auth = await authUseCase.getSession(
      getCookie(c, SESSION_COOKIE_NAME),
    );
    c.set("auth", auth);
    await next();
  };
}
