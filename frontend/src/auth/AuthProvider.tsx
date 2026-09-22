import {
  type PropsWithChildren,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { apiClient } from "../lib/api";
import {
  getLineIdToken,
  initializeLiff,
  isLineLoggedIn,
  logoutLine,
  startLineLogin,
} from "./liff";
import {
  AuthContext,
  type AuthResponse,
  type AuthStatus,
} from "./auth-context";

const useDevAuthenticatedSession =
  import.meta.env.DEV && import.meta.env.VITE_DEV_AUTH_MODE === "authenticated";

export function AuthProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<AuthStatus>("initializing");
  const [user, setUser] = useState<AuthResponse["user"]>(null);
  const [error, setError] = useState<string | null>(null);
  const bootPromise = useRef<Promise<void> | null>(null);

  const applySession = useCallback((session: AuthResponse) => {
    setStatus(session.authenticated ? "authenticated" : "anonymous");
    setUser(session.user);
  }, []);

  const requestSession = useCallback(async (): Promise<AuthResponse> => {
    const response = await apiClient.api.v1.auth.session.$get();
    if (!response.ok) {
      throw new Error("アプリのセッションを復元できませんでした");
    }
    return response.json();
  }, []);

  const loginWithIdToken = useCallback(
    async (idToken: string): Promise<void> => {
      const response = await apiClient.api.v1.auth.line.$post({
        json: { idToken },
      });
      if (!response.ok) {
        throw new Error("LINE認証に失敗しました");
      }
      applySession(await response.json());
    },
    [applySession],
  );

  const refresh = useCallback(async (): Promise<void> => {
    if (bootPromise.current) {
      return bootPromise.current;
    }

    const task = (async () => {
      setStatus("initializing");
      setError(null);

      try {
        if (useDevAuthenticatedSession) {
          applySession({
            authenticated: true,
            user: {
              id: "dev-user",
              birthYear: null,
              birthMonth: null,
              gender: null,
              regionCode: null,
              profileCompleted: false,
            },
          });
          return;
        }

        const session = await requestSession();
        if (session.authenticated) {
          applySession(session);
          return;
        }

        const liffInitialized = await initializeLiff();
        if (liffInitialized && isLineLoggedIn()) {
          const idToken = getLineIdToken();
          if (idToken) {
            await loginWithIdToken(idToken);
            return;
          }
        }

        applySession(session);
      } catch (cause) {
        setStatus("anonymous");
        setUser(null);
        setError(toErrorMessage(cause));
      }
    })().finally(() => {
      bootPromise.current = null;
    });

    bootPromise.current = task;
    return task;
  }, [applySession, loginWithIdToken, requestSession]);

  const login = useCallback(async (): Promise<void> => {
    setError(null);

    try {
      const liffInitialized = await initializeLiff();
      if (!liffInitialized) {
        throw new Error("VITE_LINE_LIFF_IDが設定されていません");
      }

      if (!isLineLoggedIn()) {
        startLineLogin();
        return;
      }

      const idToken = getLineIdToken();
      if (!idToken) {
        throw new Error("LINE ID tokenを取得できません");
      }

      setStatus("initializing");
      await loginWithIdToken(idToken);
    } catch (cause) {
      setStatus("anonymous");
      setError(toErrorMessage(cause));
    }
  }, [loginWithIdToken]);

  const logout = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      const response = await apiClient.api.v1.auth.logout.$post();
      if (!response.ok) {
        throw new Error("ログアウトに失敗しました");
      }
      logoutLine();
      applySession({ authenticated: false, user: null });
    } catch (cause) {
      setError(toErrorMessage(cause));
    }
  }, [applySession]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <AuthContext.Provider value={{ status, user, error, refresh, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

function toErrorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : "認証に失敗しました";
}
