import type { AuditEvent, Session, User, VerificationToken } from "./types.js";

export interface AuthRepository {
  findUserByEmail(email: string): Promise<User | null>;
  findUserById(id: string): Promise<User | null>;
  insertUser(user: User): Promise<void>;
  updateUser(user: User): Promise<void>;
  insertVerificationToken(token: VerificationToken): Promise<void>;
  findVerificationToken(tokenHash: string): Promise<VerificationToken | null>;
  updateVerificationToken(token: VerificationToken): Promise<void>;
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

  async updateVerificationToken(token: VerificationToken): Promise<void> {
    this.verificationTokens.set(token.tokenHash, token);
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
