import type { ConcernProcessingMessage } from "./application/port/concern-processing-queue";

// Wrangler の `cloudflare:workers` が参照する Env に、wrangler.jsonc で
// 定義したリソースを追加する。wrangler types を事前生成しなくても型検査できる。
declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database;
      AI: Ai;
      CONCERN_PROCESSING_QUEUE?: Queue<ConcernProcessingMessage>;
      CONCERN_VECTOR_INDEX?: Vectorize;
      CONCERN_CLUSTER_SIMILARITY_THRESHOLD?: string;
      CONCERN_VECTOR_INDEX_VERSION?: string;
      LINE_CHANNEL_ID?: string;
      CORS_ORIGIN?: string;
      AUTH_SESSION_TTL_SECONDS?: string;
    }
  }
}

// Hono の Generics を通じて c.env.DB のように型安全にアクセスする。
export type Bindings = Cloudflare.Env;
