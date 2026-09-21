import { createContext } from "react";

export type AuthResponse = {
  authenticated: boolean;
  user: { id: string } | null;
};

export type AuthStatus = "initializing" | "anonymous" | "authenticated";

export type AuthContextValue = {
  status: AuthStatus;
  user: AuthResponse["user"];
  error: string | null;
  refresh: () => Promise<void>;
  login: () => Promise<void>;
  logout: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | undefined>(
  undefined,
);
