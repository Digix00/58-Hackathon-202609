import { and, eq, gt, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import type {
  SessionRepository,
  UserRepository,
} from "../../application/repository/auth.repository";
import type { Session } from "../../application/entity/session";
import type {
  User,
  ValidatedUserProfilePatch,
} from "../../application/entity/user";
import { sessions, users } from "./schema";

export class D1UserRepository implements UserRepository {
  private readonly db: ReturnType<typeof drizzle>;

  constructor(db: D1Database) {
    this.db = drizzle(db);
  }

  async selectOrCreateByLineUserId(
    lineUserId: string,
    userId: string,
    profile: ValidatedUserProfilePatch = {},
  ): Promise<User> {
    const existing = await this.selectByLineUserId(lineUserId);

    if (existing) {
      return this.updateExistingProfile(existing, profile);
    }

    const now = new Date().toISOString();
    await this.db
      .insert(users)
      .values({
        id: userId,
        lineUserId,
        birthYear: profile.birthYear ?? null,
        genderCode: profile.gender ?? null,
        regionCode: profile.regionCode ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: users.lineUserId })
      .run();

    const created = await this.selectByLineUserId(lineUserId);

    if (!created) {
      throw new Error("failed to create auth user");
    }

    return created;
  }

  async selectById(userId: string): Promise<User | null> {
    const row = await this.db
      .select({
        id: users.id,
        lineUserId: users.lineUserId,
        birthYear: users.birthYear,
        gender: users.genderCode,
        regionCode: users.regionCode,
      })
      .from(users)
      .where(eq(users.id, userId))
      .get();
    return this.toUser(row);
  }

  async updateProfile(
    userId: string,
    profile: ValidatedUserProfilePatch,
  ): Promise<User | null> {
    const now = new Date().toISOString();
    const values: Partial<typeof users.$inferInsert> = { updatedAt: now };

    if ("birthYear" in profile) {
      values.birthYear = profile.birthYear ?? null;
    }
    if ("gender" in profile) {
      values.genderCode = profile.gender ?? null;
    }
    if ("regionCode" in profile) {
      values.regionCode = profile.regionCode ?? null;
    }

    await this.db.update(users).set(values).where(eq(users.id, userId)).run();
    return this.selectById(userId);
  }

  private async selectByLineUserId(lineUserId: string): Promise<User | null> {
    const row = await this.db
      .select({
        id: users.id,
        lineUserId: users.lineUserId,
        birthYear: users.birthYear,
        gender: users.genderCode,
        regionCode: users.regionCode,
      })
      .from(users)
      .where(eq(users.lineUserId, lineUserId))
      .get();
    return this.toUser(row);
  }

  private toUser(
    row:
      | {
          id: string;
          lineUserId: string;
          birthYear: number | null;
          gender: string | null;
          regionCode: string | null;
        }
      | undefined,
  ): User | null {
    if (!row) {
      return null;
    }

    return {
      ...row,
      gender: row.gender as User["gender"],
      regionCode: row.regionCode as User["regionCode"],
    };
  }

  private async updateExistingProfile(
    user: User,
    profile: ValidatedUserProfilePatch,
  ): Promise<User> {
    if (Object.keys(profile).length === 0) {
      return user;
    }

    const updated = await this.updateProfile(user.id, profile);
    if (!updated) {
      throw new Error("failed to update auth user profile");
    }

    return updated;
  }
}

export class D1SessionRepository implements SessionRepository {
  private readonly db: ReturnType<typeof drizzle>;

  constructor(db: D1Database) {
    this.db = drizzle(db);
  }

  async insert(session: {
    id: string;
    tokenHash: string;
    userId: string | null;
    expiresAt: string;
    createdAt: string;
  }): Promise<Session> {
    await this.db
      .insert(sessions)
      .values({
        id: session.id,
        tokenHash: session.tokenHash,
        userId: session.userId,
        expiresAt: session.expiresAt,
        createdAt: session.createdAt,
      })
      .run();

    return {
      id: session.id,
      userId: session.userId,
      expiresAt: session.expiresAt,
    };
  }

  async selectByTokenHash(
    tokenHash: string,
    now: string,
  ): Promise<Session | null> {
    return (await this.db
      .select({
        id: sessions.id,
        userId: sessions.userId,
        expiresAt: sessions.expiresAt,
      })
      .from(sessions)
      .where(
        and(
          eq(sessions.tokenHash, tokenHash),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, now),
        ),
      )
      .get()) ?? null;
  }

  async updateRevokedAtByTokenHash(
    tokenHash: string,
    revokedAt: string,
  ): Promise<void> {
    await this.db
      .update(sessions)
      .set({ revokedAt })
      .where(
        and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt)),
      )
      .run();
  }
}
