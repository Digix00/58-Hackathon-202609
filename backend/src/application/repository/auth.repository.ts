import type { Session } from "../entity/session";
import type {
  User,
  ValidatedUserProfilePatch,
} from "../entity/user";

export interface UserRepository {
  selectOrCreateByLineUserId(
    lineUserId: string,
    userId: string,
    profile?: ValidatedUserProfilePatch,
  ): Promise<User>;
  selectById(userId: string): Promise<User | null>;
  updateProfile(
    userId: string,
    profile: ValidatedUserProfilePatch,
  ): Promise<User | null>;
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
  updateRevokedAtByTokenHash(tokenHash: string, revokedAt: string): Promise<void>;
}
