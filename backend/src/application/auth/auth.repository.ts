export interface AuthUser {
  id: string;
  lineUserId: string;
}

export interface AuthSession {
  id: string;
  userId: string | null;
  expiresAt: string;
}

export interface UserRepository {
  findOrCreateByLineUserId(lineUserId: string, userId: string): Promise<AuthUser>;
  findById(userId: string): Promise<AuthUser | null>;
}

export interface SessionRepository {
  create(session: {
    id: string;
    tokenHash: string;
    userId: string | null;
    expiresAt: string;
    createdAt: string;
  }): Promise<AuthSession>;
  findByTokenHash(tokenHash: string, now: string): Promise<AuthSession | null>;
  revokeByTokenHash(tokenHash: string, revokedAt: string): Promise<void>;
}
