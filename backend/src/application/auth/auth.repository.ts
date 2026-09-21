import type { Session } from "../entity/session";
import type { User } from "../entity/user";

export interface UserRepository {
  selectOrCreateByLineUserId(lineUserId: string, userId: string): Promise<User>;
  selectById(userId: string): Promise<User | null>;
}

export interface SessionRepository {
  create(session: {
    id: string;
    tokenHash: string;
    userId: string | null;
    expiresAt: string;
    createdAt: string;
  }): Promise<Session>;
  selectByTokenHash(tokenHash: string, now: string): Promise<Session | null>;
  updateRevokedAtByTokenHash(tokenHash: string, revokedAt: string): Promise<void>;
}
