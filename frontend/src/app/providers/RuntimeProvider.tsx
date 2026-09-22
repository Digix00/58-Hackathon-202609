import { useEffect, useMemo, useState } from 'react'
import { closeLiffWindow, initializeLiff, type LiffSession } from '../../infrastructure/liff/client'
import { RuntimeContext, type RuntimeContextValue, type RuntimeState } from './RuntimeContext'
const liffId = import.meta.env.VITE_LINE_LIFF_ID
const forceLiffMode = import.meta.env.DEV && import.meta.env.VITE_DEV_LIFF_MODE === 'true'
const shouldInitializeLiff = Boolean(liffId) && !forceLiffMode

function getInitialRuntimeState(): RuntimeState {
  if (forceLiffMode) return { status: 'ready', mode: 'liff' }
  if (liffId) return { status: 'initializing' }
  return { status: 'ready', mode: 'browser' }
}

function getRuntimeStateFromSession(session: LiffSession | null): RuntimeState {
  return {
    status: 'ready',
    mode: session?.isInClient ? 'liff' : 'browser',
  }
}

function createLiffUrl(path: string) {
  if (!liffId) return null
  return `https://liff.line.me/${liffId}${path}`
}

function canCloseLiffWindow(state: RuntimeState) {
  return state.status === 'ready' && state.mode === 'liff'
}

function closeRuntimeWindow(state: RuntimeState) {
  if (!canCloseLiffWindow(state)) return
  closeLiffWindow()
}

export function RuntimeProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<RuntimeState>(getInitialRuntimeState)

  useEffect(() => {
    if (!shouldInitializeLiff) return

    let isCurrent = true

    const initializeRuntime = async () => {
      try {
        const session = await initializeLiff()
        if (isCurrent) setState(getRuntimeStateFromSession(session))
      } catch {
        if (isCurrent) setState({ status: 'failed' })
      }
    }

    void initializeRuntime()

    return () => {
      isCurrent = false
    }
  }, [])

  const value = useMemo<RuntimeContextValue>(
    () => ({
      state,
      liffUrl: createLiffUrl,
      closeWindow: () => closeRuntimeWindow(state),
    }),
    [state],
  )
  return <RuntimeContext.Provider value={value}>{children}</RuntimeContext.Provider>
}
