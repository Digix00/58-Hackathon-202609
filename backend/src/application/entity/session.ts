export interface Session {
  id: string;
  userId: string | null;
  expiresAt: string;
}

export interface SessionInsertInput {
  id: string;
  tokenHash: string;
  userId: string | null;
  expiresAt: string;
  createdAt: string;
}
