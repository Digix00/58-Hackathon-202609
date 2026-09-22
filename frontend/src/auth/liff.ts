import liff from "@line/liff";

let initialization: Promise<boolean> | null = null;
let initialized = false;

export async function initializeLiff(): Promise<boolean> {
  const liffId = import.meta.env.VITE_LINE_LIFF_ID;
  if (!liffId) {
    return false;
  }

  if (!initialization) {
    initialization = liff
      .init({ liffId })
      .then(() => {
        initialized = true;
        return true;
      })
      .catch((error: unknown) => {
        initialization = null;
        initialized = false;
        throw error;
      });
  }

  return initialization;
}

export function isLineLoggedIn(): boolean {
  return liff.isLoggedIn();
}

export function isInLineClient(): boolean {
  return liff.isInClient();
}

export function getLineIdToken(): string | null {
  return liff.getIDToken() ?? null;
}

export function startLineLogin(): void {
  const redirectUri = `${window.location.origin}${window.location.pathname}`;
  liff.login({ redirectUri });
}

export function logoutLine(): void {
  if (initialized && liff.isLoggedIn()) {
    liff.logout();
  }
}