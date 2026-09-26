import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";

import type { IAuthUseCase } from "../../application/usecase/auth.usecase";
import type { Bindings } from "../../types";
import { SESSION_COOKIE_NAME, setSessionCookie } from "../auth-cookie";

export type AuthVariables = {
  auth: Awaited<ReturnType<IAuthUseCase["getSession"]>>;
};

// ローカル開発専用の固定ユーザー。POST /api/v1/auth/dev の既定ユーザー(demo-a)と同じ識別子にし、
// 有効なセッションが無い場合の自動ログイン先を揃える。
const DEV_FALLBACK_LINE_USER_ID = "dev:demo-a";

/**
 * DEV_AUTH_ENABLED=true(ローカル開発用Worker設定でのみ有効)のとき、
 * 有効なセッションが無いリクエストを固定の開発用ユーザーとして自動認証する。
 * LINEログインの往復やクロスオリジンのCookie挙動に依存せず、
 * ローカルブラウザからの操作が認証エラーでブロックされないようにするための開発体験用フォールバック。
 */
export function createAuthMiddleware(
  authUseCase: IAuthUseCase,
): MiddlewareHandler<{ Bindings: Bindings; Variables: AuthVariables }> {
  return async (c, next) => {
    const token = getCookie(c, SESSION_COOKIE_NAME);
    const auth = await authUseCase.getSession(token);

    if (!auth?.user && c.env.DEV_AUTH_ENABLED === "true") {
      try {
        const devAuth = await authUseCase.authenticateWithIdentity(
          { lineUserId: DEV_FALLBACK_LINE_USER_ID },
          token,
        );
        if (devAuth.token) {
          setSessionCookie(c, devAuth.token);
        }
        c.set("auth", { session: devAuth.session, user: devAuth.user });
        await next();
        return;
      } catch {
        // 開発用フォールバックの自動ログインに失敗した場合は、
        // 通常の(未認証の)結果に委ねる。Cloudflare Access等の
        // 別の認証機構しか使わないルートで、このフォールバックが
        // リクエスト全体を巻き込んで失敗させないようにするため。
      }
    }

    c.set("auth", auth);
    await next();
  };
}
