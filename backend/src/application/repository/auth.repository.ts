import type { Session } from "../entity/session";
import type {
  DisplayLanguage,
  FontSize,
  User,
  UserProfile,
} from "../entity/user";

export interface UserRepository {
  selectOrCreateByLineUserId(lineUserId: string, userId: string): Promise<User>;
  selectById(userId: string): Promise<User | null>;
  updateProfile(userId: string, profile: UserProfile): Promise<User>;
  updateDisplayLanguage(
    userId: string,
    displayLanguage: DisplayLanguage,
  ): Promise<User>;
  updateFontSize(userId: string, fontSize: FontSize): Promise<User>;
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
