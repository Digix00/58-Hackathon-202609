import type {
  AuthSession,
  AuthUser,
  SessionRepository,
  UserRepository,
} from "../../application/auth/auth.repository";

interface UserRow {
  id: string;
  line_user_id: string;
}

interface SessionRow {
  id: string;
  user_id: string | null;
  expires_at: string;
}

export class D1UserRepository implements UserRepository {
  private readonly db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  async findOrCreateByLineUserId(
    lineUserId: string,
    userId: string,
  ): Promise<AuthUser> {
    const existing = await this.db
      .prepare("SELECT id, line_user_id FROM users WHERE line_user_id = ?")
      .bind(lineUserId)
      .first<UserRow>();

    if (existing) {
      return { id: existing.id, lineUserId: existing.line_user_id };
    }

    const now = new Date().toISOString();
    try {
      await this.db
        .prepare(
          "INSERT INTO users (id, line_user_id, created_at, updated_at) VALUES (?, ?, ?, ?)",
        )
        .bind(userId, lineUserId, now, now)
        .run();
    } catch {
      // A concurrent request may have created the same LINE user. Re-read below.
    }

    const created = await this.db
      .prepare("SELECT id, line_user_id FROM users WHERE line_user_id = ?")
      .bind(lineUserId)
      .first<UserRow>();

    if (!created) {
      throw new Error("failed to create auth user");
    }

    return { id: created.id, lineUserId: created.line_user_id };
  }

  async findById(userId: string): Promise<AuthUser | null> {
    const row = await this.db
      .prepare("SELECT id, line_user_id FROM users WHERE id = ?")
      .bind(userId)
      .first<UserRow>();

    return row ? { id: row.id, lineUserId: row.line_user_id } : null;
  }
}

export class D1SessionRepository implements SessionRepository {
  private readonly db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  async create(session: {
    id: string;
    tokenHash: string;
    userId: string | null;
    expiresAt: string;
    createdAt: string;
  }): Promise<AuthSession> {
    await this.db
      .prepare(
        "INSERT INTO sessions (id, token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
      )
      .bind(
        session.id,
        session.tokenHash,
        session.userId,
        session.expiresAt,
        session.createdAt,
      )
      .run();

    return {
      id: session.id,
      userId: session.userId,
      expiresAt: session.expiresAt,
    };
  }

  async findByTokenHash(
    tokenHash: string,
    now: string,
  ): Promise<AuthSession | null> {
    const row = await this.db
      .prepare(
        "SELECT id, user_id, expires_at FROM sessions WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?",
      )
      .bind(tokenHash, now)
      .first<SessionRow>();

    return row
      ? { id: row.id, userId: row.user_id, expiresAt: row.expires_at }
      : null;
  }

  async revokeByTokenHash(tokenHash: string, revokedAt: string): Promise<void> {
    await this.db
      .prepare(
        "UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL",
      )
      .bind(revokedAt, tokenHash)
      .run();
  }
}
