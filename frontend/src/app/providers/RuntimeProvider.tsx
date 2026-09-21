import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { closeLiffWindow, initializeLiff, loginWithLiff } from '../../infrastructure/liff/client'

export type RuntimeMode = 'browser' | 'liff'
export type AuthState = 'anonymous' | 'authenticated' | 'unavailable'
export type RuntimeState =
  | { status: 'initializing' }
  | { status: 'ready'; mode: 'browser'; auth: 'unavailable' }
  | { status: 'ready'; mode: 'liff'; auth: 'anonymous' | 'authenticated' }
  | { status: 'failed' }

type RuntimeContextValue = {
  state: RuntimeState
  liffUrl: (path: string) => string | null
  startLogin: () => void
  closeWindow: () => void
}

const RuntimeContext = createContext<RuntimeContextValue | null>(null)
const liffId = import.meta.env.VITE_LIFF_ID

function createLiffUrl(path: string) {
  return liffId ? `https://liff.line.me/${liffId}${path}` : null
}

export function RuntimeProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<RuntimeState>(() =>
    liffId ? { status: 'initializing' } : { status: 'ready', mode: 'browser', auth: 'unavailable' },
  )

  useEffect(() => {
    if (!liffId) return
    let isCurrent = true
    void initializeLiff(liffId)
      .then((session) => {
        if (!isCurrent) return
        setState(
          session.isInClient
            ? { status: 'ready', mode: 'liff', auth: session.isLoggedIn ? 'authenticated' : 'anonymous' }
            : { status: 'ready', mode: 'browser', auth: 'unavailable' },
        )
      })
      .catch(() => {
        if (isCurrent) setState({ status: 'failed' })
      })
    return () => {
      isCurrent = false
    }
  }, [])

  const value = useMemo<RuntimeContextValue>(
    () => ({
      state,
      liffUrl: createLiffUrl,
      startLogin: () => {
        if (state.status === 'ready' && state.mode === 'liff' && state.auth === 'anonymous') {
          loginWithLiff(window.location.href)
        }
      },
      closeWindow: () => {
        if (state.status === 'ready' && state.mode === 'liff') closeLiffWindow()
      },
    }),
    [state],
  )
  return <RuntimeContext.Provider value={value}>{children}</RuntimeContext.Provider>
}

export function useRuntime() {
  const context = useContext(RuntimeContext)
  if (!context) throw new Error('useRuntime must be used within RuntimeProvider')
  return context
}
