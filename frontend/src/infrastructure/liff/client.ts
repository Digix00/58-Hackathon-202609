import liff from '@line/liff'

export type LiffSession = { isInClient: boolean; isLoggedIn: boolean }

const liffId = import.meta.env.VITE_LINE_LIFF_ID
let sessionPromise: Promise<LiffSession> | undefined
let initialized = false

export function initializeLiff(): Promise<LiffSession | null> {
  if (!liffId) return Promise.resolve(null)

  sessionPromise ??= liff
    .init({ liffId })
    .then(() => {
      initialized = true
      return {
        isInClient: liff.isInClient(),
        isLoggedIn: liff.isLoggedIn(),
      }
    })
    .catch((error: unknown) => {
      sessionPromise = undefined
      initialized = false
      throw error
    })

  return sessionPromise
}

export function loginWithLiff(redirectUri: string) {
  liff.login({ redirectUri })
}

export function isLineLoggedIn() {
  return initialized && liff.isLoggedIn()
}

export function isInLineClient() {
  return initialized && liff.isInClient()
}

export function getLineIdToken() {
  return initialized ? (liff.getIDToken() ?? null) : null
}

export function logoutLine() {
  if (initialized && liff.isLoggedIn()) liff.logout()
}
