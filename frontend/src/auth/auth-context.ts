import { createContext } from "react";

import type { AuthResponse } from "../lib/api";

export type { AuthResponse };

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
