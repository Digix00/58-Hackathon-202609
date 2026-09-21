import { hc } from "hono/client";
import type { AppType } from "backend";

// ローカル開発時はwrangler devのデフォルトポートに向ける。
// 本番/プレビューではデプロイ済みWorkersのURLを.envで上書きする。
const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8787";

export const apiClient = hc<AppType>(baseUrl, {
  init: { credentials: "include" },
});
