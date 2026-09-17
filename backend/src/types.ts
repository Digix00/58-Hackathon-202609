// Bindings は wrangler.jsonc で定義したリソースの型。
// HonoのGenericsを通じて c.env.DB のように型安全にアクセスできる。
export type Bindings = {
  DB: D1Database;
};
