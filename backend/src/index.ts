import { Hono } from "hono";
import { cors } from "hono/cors";

import { healthHandlers } from "./handler/health.handler";
import type { Bindings } from "./types";

const app = new Hono<{ Bindings: Bindings }>();

// Cloud Loggingと同じ "severity" / "message" キーでJSONログを出す。
// Cloudflare Workers Logsはstdoutに出したJSON文字列をフィールドとして
// 解釈するため、Cloud Run版のzap設定と同じキー名に揃えている。
app.use("*", async (c, next) => {
  const start = Date.now();
  await next();
  console.log(
    JSON.stringify({
      severity: c.res.ok ? "INFO" : "ERROR",
      message: "request",
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs: Date.now() - start,
    }),
  );
});

app.use("*", cors());

// ハンドラ内で投げられた例外を一箇所で捕捉する。
// Cloud Run版のmiddleware.Recover()に相当する。
app.onError((err, c) => {
  console.error(
    JSON.stringify({
      severity: "ERROR",
      message: "unhandled error",
      error: err instanceof Error ? err.message : String(err),
    }),
  );
  return c.json({ status: "error", message: "internal server error" }, 500);
});

// Hono RPCの型推論はメソッドチェーンを辿って蓄積されるため、
// ルート定義は必ず同じ式にチェーンし続ける(app.get(...); app.post(...); のように
// 文を分けると、それぞれの戻り値の型が繋がらずAppTypeに反映されない)。
const routes = app.get("/health", ...healthHandlers);

export type AppType = typeof routes;
export default app;
