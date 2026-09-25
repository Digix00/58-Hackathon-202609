import type { ConcernProcessingMessage } from "./application/port/concern-processing-queue";

// Wrangler の `cloudflare:workers` が参照する Env に、wrangler.jsonc で
// 定義したリソースを追加する。wrangler types を事前生成しなくても型検査できる。
declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database;
      // ローカル開発では wrangler.dev.jsonc がこの binding を持たないため、
      // 未定義を許容してローカル用アダプタへフォールバックできるようにする。
      AI?: Ai;
      CONCERN_PROCESSING_QUEUE?: Queue<ConcernProcessingMessage>;
      CONCERN_VECTOR_INDEX?: Vectorize;
      CONCERN_CLUSTER_SIMILARITY_THRESHOLD?: string;
      CONCERN_VECTOR_INDEX_VERSION?: string;
      LINE_CHANNEL_ID?: string;
      LINE_LIFF_ID?: string;
      LINE_CHANNEL_SECRET?: string;
      LINE_CHANNEL_ACCESS_TOKEN?: string;
      INTERNAL_API_TOKEN?: string;
      ACCESS_TEAM_DOMAIN?: string;
      ACCESS_AUD?: string;
      DEV_AUTH_ENABLED?: string;
      DEV_ACCESS_BYPASS?: string;
      DEV_LINE_BROADCAST_SIMULATION?: string;
      CORS_ORIGIN?: string;
      AUTH_SESSION_TTL_SECONDS?: string;
    }
  }
}

// Hono の Generics を通じて c.env.DB のように型安全にアクセスする。
export type Bindings = Cloudflare.Env;
