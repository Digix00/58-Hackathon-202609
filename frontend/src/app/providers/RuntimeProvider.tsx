import { useEffect, useMemo, useState } from 'react'
import { closeLiffWindow, initializeLiff } from '../../infrastructure/liff/client'
import { RuntimeContext, type RuntimeContextValue, type RuntimeState } from './RuntimeContext'
const liffId = import.meta.env.VITE_LINE_LIFF_ID

function createLiffUrl(path: string) {
  return liffId ? `https://liff.line.me/${liffId}${path}` : null
}

export function RuntimeProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<RuntimeState>(() =>
    liffId ? { status: 'initializing' } : { status: 'ready', mode: 'browser' },
  )

  useEffect(() => {
    if (!liffId) return
    let isCurrent = true
    void initializeLiff()
      .then((session) => {
        if (!isCurrent) return
        if (!session) {
          setState({ status: 'ready', mode: 'browser' })
          return
        }
        setState(
          session.isInClient
            ? { status: 'ready', mode: 'liff' }
            : { status: 'ready', mode: 'browser' },
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
      closeWindow: () => {
        if (state.status === 'ready' && state.mode === 'liff') closeLiffWindow()
      },
    }),
    [state],
  )
  return <RuntimeContext.Provider value={value}>{children}</RuntimeContext.Provider>
}
