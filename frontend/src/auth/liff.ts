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
  const redirectUri = `${window.location.origin}${window.location.pathname}`;
  liff.login({ redirectUri });
}

export function logoutLine(): void {
  if (initialized && liff.isLoggedIn()) {
    liff.logout();
  }
}
