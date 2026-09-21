import liff from '@line/liff'

export type LiffSession = { isInClient: boolean; isLoggedIn: boolean }

let sessionPromise: Promise<LiffSession> | undefined

export function initializeLiff(liffId: string): Promise<LiffSession> {
  sessionPromise ??= liff.init({ liffId }).then(() => ({
    isInClient: liff.isInClient(),
    isLoggedIn: liff.isLoggedIn(),
  }))
  return sessionPromise
}

export function loginWithLiff(redirectUri: string) {
  liff.login({ redirectUri })
}

export function closeLiffWindow() {
  liff.closeWindow()
}

export function getLiffIdToken() {
  return liff.getIDToken()
}
