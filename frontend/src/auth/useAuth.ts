import { useContext } from 'react'

import { AuthContext } from './auth-context'

/**
 * Intent: AuthContextの認証状態と操作を画面から安全に参照する。
 * Boundary: Providerの値だけを公開し、LINE SDKやHttpOnly Cookieの詳細を隠す。
 * State modeling: 認証状態の遷移はAuthProviderのreducerが担当する。
 * Update surface: AuthContextで定義した認証操作。
 */
export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return value
}
