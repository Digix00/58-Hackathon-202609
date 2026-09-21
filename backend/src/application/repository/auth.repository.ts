import type { Session } from "../entity/session";
import type { User } from "../entity/user";

export interface CreateSessionInput {
  id: string;
  tokenHash: string;
  userId: string | null;
  expiresAt: string;
  createdAt: string;
}

export interface UserRepository {
  selectOrCreateByLineUserId(lineUserId: string, userId: string): Promise<User>;
  selectById(userId: string): Promise<User | null>;
}

export interface SessionRepository {
  create(input: CreateSessionInput): Promise<Session>;
  selectByTokenHash(tokenHash: string, now: string): Promise<Session | null>;
  updateRevokedAtByTokenHash(tokenHash: string, revokedAt: string): Promise<void>;
}
