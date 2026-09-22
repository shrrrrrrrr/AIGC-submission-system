import type { AuditEvent, PasswordResetToken, Session, User, VerificationToken } from "./types.js";

export interface AuthRepository {
  findUserByEmail(email: string): Promise<User | null>;
  findUserById(id: string): Promise<User | null>;
  insertUser(user: User): Promise<void>;
  updateUser(user: User): Promise<void>;
  insertVerificationToken(token: VerificationToken): Promise<void>;
  findVerificationToken(tokenHash: string): Promise<VerificationToken | null>;
  consumeVerificationTokenAndVerifyUser(tokenHash: string, consumedAt: Date): Promise<string | null>;
  insertPasswordResetToken(token: PasswordResetToken): Promise<void>;
  consumePasswordResetAndUpdatePassword(tokenHash: string, consumedAt: Date, passwordHash: string): Promise<string | null>;
  insertSession(session: Session): Promise<void>;
  findSessionByTokenHash(tokenHash: string): Promise<Session | null>;
  revokeSession(session: Session, revokedAt: Date): Promise<void>;
  revokeAllSessions(userId: string, revokedAt: Date): Promise<void>;
  insertAuditEvent(event: AuditEvent): Promise<void>;
}

export class InMemoryAuthRepository implements AuthRepository {
  readonly users = new Map<string, User>();
  readonly verificationTokens = new Map<string, VerificationToken>();
  readonly sessions = new Map<string, Session>();
  readonly auditEvents: AuditEvent[] = [];

  async findUserByEmail(email: string): Promise<User | null> {
    return [...this.users.values()].find((user) => user.email === email) ?? null;
  }

  async findUserById(id: string): Promise<User | null> {
    return this.users.get(id) ?? null;
  }

  async insertUser(user: User): Promise<void> {
    this.users.set(user.id, user);
  }

  async updateUser(user: User): Promise<void> {
    this.users.set(user.id, user);
  }

  async insertVerificationToken(token: VerificationToken): Promise<void> {
    this.verificationTokens.set(token.tokenHash, token);
  }

  async findVerificationToken(tokenHash: string): Promise<VerificationToken | null> {
    return this.verificationTokens.get(tokenHash) ?? null;
  }

  async consumeVerificationTokenAndVerifyUser(tokenHash: string, consumedAt: Date): Promise<string | null> {
    const token = this.verificationTokens.get(tokenHash);
    if (!token || token.consumedAt || token.expiresAt <= consumedAt) return null;
    this.verificationTokens.set(tokenHash, { ...token, consumedAt });
    const user = this.users.get(token.userId);
    if (!user) return null;
    this.users.set(user.id, { ...user, emailVerifiedAt: consumedAt });
    return token.userId;
  }

  readonly passwordResetTokens = new Map<string, PasswordResetToken>();

  async insertPasswordResetToken(token: PasswordResetToken): Promise<void> {
    this.passwordResetTokens.set(token.tokenHash, token);
  }

  async consumePasswordResetAndUpdatePassword(tokenHash: string, consumedAt: Date, passwordHash: string): Promise<string | null> {
    const token = this.passwordResetTokens.get(tokenHash);
    if (!token || token.consumedAt || token.expiresAt <= consumedAt) return null;
    this.passwordResetTokens.set(tokenHash, { ...token, consumedAt });
    const user = this.users.get(token.userId);
    if (!user) return null;
    this.users.set(user.id, { ...user, passwordHash });
    for (const session of this.sessions.values()) {
      if (session.userId === user.id && session.revokedAt === null) {
        this.sessions.set(session.id, { ...session, revokedAt: consumedAt });
      }
    }
    return token.userId;
  }

  async insertSession(session: Session): Promise<void> {
    this.sessions.set(session.id, session);
  }

  async findSessionByTokenHash(tokenHash: string): Promise<Session | null> {
    return [...this.sessions.values()].find((session) => session.tokenHash === tokenHash) ?? null;
  }

  async revokeSession(session: Session, revokedAt: Date): Promise<void> {
    this.sessions.set(session.id, { ...session, revokedAt });
  }

  async revokeAllSessions(userId: string, revokedAt: Date): Promise<void> {
    for (const session of this.sessions.values()) {
      if (session.userId === userId && session.revokedAt === null) {
        this.sessions.set(session.id, { ...session, revokedAt });
      }
    }
  }

  async insertAuditEvent(event: AuditEvent): Promise<void> {
    this.auditEvents.push(event);
  }
}
