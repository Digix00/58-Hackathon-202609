import type { Session } from "../entity/session";
import type { DisplaySettings, User, UserProfile } from "../entity/user";

export interface UserRepository {
  selectOrCreateByLineUserId(lineUserId: string, userId: string): Promise<User>;
  selectById(userId: string): Promise<User | null>;
  updateProfile(userId: string, profile: UserProfile): Promise<User>;
  updateDisplaySettings(
    userId: string,
    settings: DisplaySettings,
  ): Promise<User>;
}

export interface SessionRepository {
  insert(input: {
    id: string;
    tokenHash: string;
    userId: string | null;
    expiresAt: string;
    createdAt: string;
  }): Promise<Session>;
  selectByTokenHash(tokenHash: string, now: string): Promise<Session | null>;
  updateRevokedAtByTokenHash(
    tokenHash: string,
    revokedAt: string,
  ): Promise<void>;
}
