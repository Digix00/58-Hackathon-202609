import type { Bindings } from "../types";

/** ブラウザセッションを保持するCookie名。HTTP層で共有する。 */
export const SESSION_COOKIE_NAME = "__Host-session";

/** ローカルHTTPではSecure Cookieを保存しないブラウザにも対応する。 */
export function getSessionCookieSettings(
  requestUrl: string,
  bindings: Pick<Bindings, "DEV_AUTH_ENABLED">,
) {
  const url = new URL(requestUrl);
  const isLocalHttp =
    bindings.DEV_AUTH_ENABLED === "true" &&
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);

  return {
    name: isLocalHttp ? "dev-session" : SESSION_COOKIE_NAME,
    options: {
      httpOnly: true,
      secure: !isLocalHttp,
      sameSite: "Lax" as const,
      path: "/",
    },
  };
}
