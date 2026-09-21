import liff from "@line/liff";

let initialization: Promise<boolean> | null = null;

export async function initializeLiff(): Promise<boolean> {
  const liffId = import.meta.env.VITE_LINE_LIFF_ID;
  if (!liffId) {
    return false;
  }

  if (!initialization) {
    initialization = liff
      .init({ liffId })
      .then(() => true)
      .catch((error: unknown) => {
        initialization = null;
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
  liff.login({ redirectUri: window.location.href });
}
