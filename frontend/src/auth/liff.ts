import {
  getLineIdToken,
  initializeLiff as initializeLiffClient,
  isInLineClient,
  isLineLoggedIn,
  loginWithLiff,
  logoutLine,
} from '../infrastructure/liff/client'

export async function initializeLiff(): Promise<boolean> {
  return (await initializeLiffClient()) !== null
}

export { getLineIdToken, isInLineClient, isLineLoggedIn, logoutLine }

export function startLineLogin(): void {
  loginWithLiff(window.location.href)
}
