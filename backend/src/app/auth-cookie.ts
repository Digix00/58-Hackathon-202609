import { setCookie } from "hono/cookie";

/** ブラウザセッションを保持するCookie名。HTTP層で共有する。 */
export const SESSION_COOKIE_NAME = "__Host-session";

/** セッションCookieの既定の有効期間(30日)。 */
export const DEFAULT_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/** セッションCookieを設定する。ハンドラー・ミドルウェア間で設定を共有する。 */
export function setSessionCookie(
  c: Parameters<typeof setCookie>[0],
  token: string,
  maxAge: number = DEFAULT_SESSION_MAX_AGE_SECONDS,
): void {
  setCookie(c, SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge,
  });
}
