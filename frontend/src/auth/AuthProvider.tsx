import {
  type PropsWithChildren,
  useCallback,
  useEffect,
  useRef,
  useMemo,
  useReducer,
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

type AuthState = {
  status: AuthStatus;
  user: AuthResponse["user"];
  error: string | null;
};

type AuthAction =
  | { type: "refreshStarted" }
  | { type: "loginStarted" }
  | { type: "sessionApplied"; session: AuthResponse }
  | { type: "sessionFailed"; message: string }
  | { type: "errorCleared" }
  | { type: "operationFailed"; message: string };

const initialAuthState: AuthState = {
  status: "initializing",
  user: null,
  error: null,
};

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case "refreshStarted":
      return { status: "initializing", user: state.user, error: null };
    case "loginStarted":
      return { status: "initializing", user: state.user, error: null };
    case "sessionApplied":
      return {
        status: action.session.authenticated ? "authenticated" : "anonymous",
        user: action.session.user,
        error: null,
      };
    case "sessionFailed":
      return { status: "anonymous", user: null, error: action.message };
    case "errorCleared":
      return { ...state, error: null };
    case "operationFailed":
      return { ...state, error: action.message };
  }
}

/**
 * Intent: LINE セッションの復元・ログイン・ログアウトと、その状態遷移を局所化する。
 * Boundary: 認証状態と、認証操作の完了を待てる最小限の関数だけを AuthContext へ公開する。
 * State modeling: status、user、error の同時更新を reducer に集約し、セッション状態の不整合を防ぐ。
 * Update surface: refresh、login、logout。認証情報や SDK の詳細は外へ漏らさない。
 * Hidden complexity: 初期化の重複排除、LIFF ログインへのフォールバック、通信失敗時の匿名状態への遷移。
 */
export function AuthProvider({ children }: PropsWithChildren) {
  const [state, dispatch] = useReducer(authReducer, initialAuthState);
  const bootPromise = useRef<Promise<void> | null>(null);

  const applySession = useCallback((session: AuthResponse) => {
    dispatch({ type: "sessionApplied", session });
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
      dispatch({ type: "refreshStarted" });

      try {
        if (useDevAuthenticatedSession) {
          applySession({
            authenticated: true,
            user: { id: "dev-user" },
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
        dispatch({ type: "sessionFailed", message: toErrorMessage(cause) });
      }
    })().finally(() => {
      bootPromise.current = null;
    });

    bootPromise.current = task;
    return task;
  }, [applySession, loginWithIdToken, requestSession]);

  const login = useCallback(async (): Promise<void> => {
    dispatch({ type: "errorCleared" });

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

      dispatch({ type: "loginStarted" });
      await loginWithIdToken(idToken);
    } catch (cause) {
      dispatch({ type: "sessionFailed", message: toErrorMessage(cause) });
    }
  }, [loginWithIdToken]);

  const logout = useCallback(async (): Promise<void> => {
    dispatch({ type: "errorCleared" });
    try {
      const response = await apiClient.api.v1.auth.logout.$post();
      if (!response.ok) {
        throw new Error("ログアウトに失敗しました");
      }
      logoutLine();
      applySession({ authenticated: false, user: null });
    } catch (cause) {
      dispatch({ type: "operationFailed", message: toErrorMessage(cause) });
    }
  }, [applySession]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const contextValue = useMemo(
    () => ({ ...state, refresh, login, logout }),
    [login, logout, refresh, state],
  );

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

function toErrorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : "認証に失敗しました";
}
