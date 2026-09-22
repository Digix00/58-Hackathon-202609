import type {
  SessionRepository,
  UserRepository,
} from "../repository/auth.repository";
import type { LineTokenVerifier } from "../port/line-token-verifier";
import type { Session } from "../entity/session";
import type { User } from "../entity/user";

const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export interface SessionView {
  session: Session;
  user: User | null;
}

export interface SessionResult extends SessionView {
  token?: string;
}

export interface AuthUseCasePort {
  authenticateWithLine(
    idToken: string,
    currentToken?: string,
  ): Promise<SessionResult>;
  getOrCreateSession(currentToken?: string): Promise<SessionResult>;
  getSession(currentToken?: string): Promise<SessionView | null>;
  logout(currentToken?: string): Promise<void>;
}

export class AuthUseCase implements AuthUseCasePort {
  private readonly sessionTtlSeconds: number;
  private readonly users: UserRepository;
  private readonly sessions: SessionRepository;
  private readonly lineTokenVerifier: LineTokenVerifier;
  private readonly now: () => Date;
  private readonly createId: (prefix: string) => string;

  constructor(
    users: UserRepository,
    sessions: SessionRepository,
    lineTokenVerifier: LineTokenVerifier,
    sessionTtlSeconds = DEFAULT_SESSION_TTL_SECONDS,
    now: () => Date = () => new Date(),
    createId: (prefix: string) => string = generateId,
  ) {
    this.users = users;
    this.sessions = sessions;
    this.lineTokenVerifier = lineTokenVerifier;
    this.now = now;
    this.createId = createId;
    this.sessionTtlSeconds = Number.isFinite(sessionTtlSeconds)
      ? Math.max(60, Math.floor(sessionTtlSeconds))
      : DEFAULT_SESSION_TTL_SECONDS;
  }

  async authenticateWithLine(
    idToken: string,
    currentToken?: string,
  ): Promise<SessionResult> {
    const identity = await this.lineTokenVerifier.verify(idToken);
    const user = await this.findOrCreateUser(identity.lineUserId);

    const currentSession = await this.findSession(currentToken);
    const authenticatedSession = await this.createSession(user.id);

    if (currentSession) {
      await this.revokeSession(currentToken);
    }

    return {
      ...authenticatedSession,
      user,
    };
  }

  async getOrCreateSession(currentToken?: string): Promise<SessionResult> {
    const currentSession = await this.findSession(currentToken);
    if (currentSession) {
      const user = await this.getUser(currentSession);
      if (currentSession.userId && !user) {
        await this.revokeSession(currentToken);
        return this.createSession(null);
      }

      return {
        session: currentSession,
        user,
      };
    }

    return this.createSession(null);
  }

  async getSession(currentToken?: string): Promise<SessionView | null> {
    const session = await this.findSession(currentToken);
    if (!session) {
      return null;
    }

    const user = await this.getUser(session);
    if (session.userId && !user) {
      await this.revokeSession(currentToken);
      return null;
    }

    return {
      session,
      user,
    };
  }

  async logout(currentToken?: string): Promise<void> {
    await this.revokeSession(currentToken);
  }

  private async createSession(userId: string | null): Promise<SessionResult> {
    const now = this.now();
    const token = generateToken();
    const session = await this.sessions.insert({
      id: this.createId("session"),
      tokenHash: await hashToken(token),
      userId,
      expiresAt: new Date(
        now.getTime() + this.sessionTtlSeconds * 1000,
      ).toISOString(),
      createdAt: now.toISOString(),
    });

    return {
      session,
      user: null,
      token,
    };
  }

  private async findOrCreateUser(lineUserId: string): Promise<User> {
    const existingUser = await this.users.selectByLineUserId(lineUserId);
    if (existingUser) {
      return existingUser;
    }

    return this.users.insert({
      id: this.createId("user"),
      lineUserId,
    });
  }

  private async findSession(
    currentToken?: string,
  ): Promise<Session | null> {
    if (!currentToken) {
      return null;
    }

    return this.sessions.selectByTokenHash(
      await hashToken(currentToken),
      this.now().toISOString(),
    );
  }

  private async getUser(session: Session): Promise<User | null> {
    return session.userId ? this.users.selectById(session.userId) : null;
  }

  private async revokeSession(currentToken?: string): Promise<void> {
    if (!currentToken) {
      return;
    }

    await this.sessions.updateRevokedAtByTokenHash(
      await hashToken(currentToken),
      this.now().toISOString(),
    );
  }
}

export function generateId(prefix: string): string {
  return `${prefix}_${encodeBase64Url(randomBytes(16))}`;
}

function generateToken(): string {
  return encodeBase64Url(randomBytes(32));
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
