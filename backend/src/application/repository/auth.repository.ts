import type { Session, SessionInsertInput } from "../entity/session";
import type { User, UserInsertInput } from "../entity/user";

export interface UserRepository {
  selectByLineUserId(lineUserId: string): Promise<User | null>;
  insert(input: UserInsertInput): Promise<User>;
  selectById(userId: string): Promise<User | null>;
}

export interface SessionRepository {
  insert(input: SessionInsertInput): Promise<Session>;
  selectByTokenHash(tokenHash: string, now: string): Promise<Session | null>;
  updateRevokedAtByTokenHash(tokenHash: string, revokedAt: string): Promise<void>;
}
