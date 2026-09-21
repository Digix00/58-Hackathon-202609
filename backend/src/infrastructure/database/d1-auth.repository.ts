import { and, eq, gt, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import type {
  SessionRepository,
  UserRepository,
} from "../../application/repository/auth.repository";
import type {
  Session,
  SessionInsertInput,
} from "../../application/entity/session";
import type { User, UserInsertInput } from "../../application/entity/user";
import { sessions, users } from "./schema";

export class D1UserRepository implements UserRepository {
  private readonly db: ReturnType<typeof drizzle>;

  constructor(db: D1Database) {
    this.db = drizzle(db);
  }

  async insert(input: UserInsertInput): Promise<User> {
    const now = new Date().toISOString();
    await this.db
      .insert(users)
      .values({
        id: input.id,
        lineUserId: input.lineUserId,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    return {
      id: input.id,
      lineUserId: input.lineUserId,
    };
  }

  async selectByLineUserId(lineUserId: string): Promise<User | null> {
    return (await this.db
      .select({ id: users.id, lineUserId: users.lineUserId })
      .from(users)
      .where(eq(users.lineUserId, lineUserId))
      .get()) ?? null;
  }

  async selectById(userId: string): Promise<User | null> {
    return (await this.db
      .select({ id: users.id, lineUserId: users.lineUserId })
      .from(users)
      .where(eq(users.id, userId))
      .get()) ?? null;
  }

}

export class D1SessionRepository implements SessionRepository {
  private readonly db: ReturnType<typeof drizzle>;

  constructor(db: D1Database) {
    this.db = drizzle(db);
  }

  async insert(session: SessionInsertInput): Promise<Session> {
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
