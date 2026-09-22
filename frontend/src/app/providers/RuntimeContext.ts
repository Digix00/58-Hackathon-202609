import { createContext, useContext } from 'react'

export type RuntimeMode = 'browser' | 'liff'
export type AuthState = 'anonymous' | 'authenticated' | 'unavailable'
export type RuntimeState =
  | { status: 'initializing' }
  | { status: 'ready'; mode: 'browser'; auth: 'unavailable' }
  | { status: 'ready'; mode: 'liff'; auth: 'anonymous' | 'authenticated' }
  | { status: 'failed' }

export type RuntimeContextValue = {
  state: RuntimeState
  liffUrl: (path: string) => string | null
  startLogin: () => void
  closeWindow: () => void
}

export const RuntimeContext = createContext<RuntimeContextValue | null>(null)

export function useRuntime() {
  const context = useContext(RuntimeContext)
  if (!context) throw new Error('useRuntime must be used within RuntimeProvider')
  return context
}
