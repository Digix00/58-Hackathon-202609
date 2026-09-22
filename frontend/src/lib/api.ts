import { hc } from 'hono/client'
import type { InferResponseType } from 'hono'
import type { AppType } from 'backend'

// ローカル開発時はwrangler devのデフォルトポートに向ける。
// 本番/プレビューではデプロイ済みWorkersのURLを.envで上書きする。
const baseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8787'

export const apiClient = hc<AppType>(baseUrl, {
  init: { credentials: 'include' },
})

export type AuthResponse = InferResponseType<typeof apiClient.api.v1.auth.session.$get, 200>

export type CreateConcernResponse = InferResponseType<typeof apiClient.api.v1.concerns.$post, 201>
