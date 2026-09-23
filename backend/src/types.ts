// Wrangler の `cloudflare:workers` が参照する Env に、wrangler.jsonc で
// 定義したリソースを追加する。wrangler types を事前生成しなくても型検査できる。
declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database;
      AI: Ai;
      LINE_CHANNEL_ID?: string;
      CORS_ORIGIN?: string;
      AUTH_SESSION_TTL_SECONDS?: string;
    }
  }
}

// Hono の Generics を通じて c.env.DB のように型安全にアクセスする。
export type Bindings = Cloudflare.Env;
