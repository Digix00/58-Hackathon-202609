import { createContext, useContext } from 'react'

export type RuntimeMode = 'browser' | 'liff'
export type AuthState = 'anonymous' | 'authenticated' | 'unavailable'
export type RuntimeState =
  | { status: 'initializing' }
  | { status: 'ready'; mode: 'browser'; liffInitializationFailed?: true }
  | { status: 'ready'; mode: 'liff' }

export type RuntimeContextValue = {
  state: RuntimeState
  liffUrl: (path: string) => string | null
}

export const RuntimeContext = createContext<RuntimeContextValue | null>(null)

/**
 * Intent: 通常WebとLIFFの実行環境を画面から参照する。
 * Boundary: RuntimeProviderが確定した状態と、LIFF導線の生成操作だけを公開する。
 * State modeling: 初期化中・利用可能・初期化失敗後の読み取り専用fallbackを判別可能にする。
 */
export function useRuntime() {
  const context = useContext(RuntimeContext)
  if (!context) throw new Error('useRuntime must be used within RuntimeProvider')
  return context
}
