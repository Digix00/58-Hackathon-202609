import { and, eq, gt, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { RegionCode } from "../../application/entity/region-code";
import type { Session } from "../../application/entity/session";
import type { Gender, User, UserProfile } from "../../application/entity/user";
import type {
  SessionRepository,
  UserRepository,
} from "../../application/repository/auth.repository";
import { sessions, users } from "./schema";

const userColumns = {
  id: users.id,
  lineUserId: users.lineUserId,
  birthYear: users.birthYear,
  birthMonth: users.birthMonth,
  gender: users.genderCode,
  regionCode: users.regionCode,
};

export class D1UserRepository implements UserRepository {
  private readonly db: ReturnType<typeof drizzle>;

  constructor(db: D1Database) {
    this.db = drizzle(db);
  }

  async selectOrCreateByLineUserId(
    lineUserId: string,
    userId: string,
  ): Promise<User> {
    const existing = await this.selectByLineUserId(lineUserId);

    if (existing) {
      return existing;
    }

    const now = new Date().toISOString();
    await this.db
      .insert(users)
      .values({
        id: userId,
        lineUserId,
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
    const user = await this.db
      .select(userColumns)
      .from(users)
      .where(eq(users.id, userId))
      .get();

    return user ? toUser(user) : null;
  }

  async updateProfile(userId: string, profile: UserProfile): Promise<User> {
    await this.db
      .update(users)
      .set({
        birthYear: profile.birthYear,
        birthMonth: profile.birthMonth,
        genderCode: profile.gender,
        regionCode: profile.regionCode,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(users.id, userId))
      .run();

    const updated = await this.selectById(userId);
    if (!updated) {
      throw new Error("failed to update user profile");
    }

    return updated;
  }

  private async selectByLineUserId(lineUserId: string): Promise<User | null> {
    const user = await this.db
      .select(userColumns)
      .from(users)
      .where(eq(users.lineUserId, lineUserId))
      .get();

    return user ? toUser(user) : null;
  }
}

function toUser(user: {
  id: string;
  lineUserId: string;
  birthYear: number | null;
  birthMonth: number | null;
  gender: string | null;
  regionCode: string | null;
}): User {
  return {
    ...user,
    gender: user.gender as Gender | null,
    regionCode: user.regionCode as RegionCode | null,
  };
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
    return (
      (await this.db
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
        .get()) ?? null
    );
  }

  async updateRevokedAtByTokenHash(
    tokenHash: string,
    revokedAt: string,
  ): Promise<void> {
    await this.db
      .update(sessions)
      .set({ revokedAt })
      .where(and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt)))
      .run();
  }
}
