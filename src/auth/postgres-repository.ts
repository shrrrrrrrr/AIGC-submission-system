import type { Pool, PoolClient } from "pg";
import type { AuthRepository } from "./repository.js";
import type { AuditEvent, PasswordResetToken, Session, User, VerificationToken, Role } from "./types.js";

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  email_verified_at: Date | null;
  mfa_enabled: boolean;
  created_at: Date;
  roles: Role[] | null;
};

export class PostgresAuthRepository implements AuthRepository {
  constructor(private readonly pool: Pool) {}

  async findUserByEmail(email: string): Promise<User | null> {
    const result = await this.pool.query<UserRow>(
      `SELECT u.*, COALESCE(array_agg(ur.role) FILTER (WHERE ur.role IS NOT NULL), '{}') AS roles
       FROM users u LEFT JOIN user_roles ur ON ur.user_id = u.id WHERE u.email = $1 GROUP BY u.id`, [email]);
    return result.rows[0] ? mapUser(result.rows[0]) : null;
  }

  async findUserById(id: string): Promise<User | null> {
    const result = await this.pool.query<UserRow>(
      `SELECT u.*, COALESCE(array_agg(ur.role) FILTER (WHERE ur.role IS NOT NULL), '{}') AS roles
       FROM users u LEFT JOIN user_roles ur ON ur.user_id = u.id WHERE u.id = $1 GROUP BY u.id`, [id]);
    return result.rows[0] ? mapUser(result.rows[0]) : null;
  }

  async insertUser(user: User): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO users (id, email, password_hash, email_verified_at, mfa_enabled, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [user.id, user.email, user.passwordHash, user.emailVerifiedAt, user.mfaEnabled, user.createdAt],
      );
      await client.query("INSERT INTO user_roles (user_id, role) SELECT $1, unnest($2::text[])", [user.id, user.roles]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async updateUser(user: User): Promise<void> {
    await this.pool.query(
      `UPDATE users SET email = $2, password_hash = $3, email_verified_at = $4, mfa_enabled = $5 WHERE id = $1`,
      [user.id, user.email, user.passwordHash, user.emailVerifiedAt, user.mfaEnabled],
    );
  }

  async insertVerificationToken(token: VerificationToken): Promise<void> {
    await this.pool.query(`INSERT INTO email_verification_tokens (token_hash, user_id, expires_at) VALUES ($1, $2, $3)`, [token.tokenHash, token.userId, token.expiresAt]);
  }

  async findVerificationToken(tokenHash: string): Promise<VerificationToken | null> {
    const result = await this.pool.query<VerificationToken>(`SELECT token_hash AS "tokenHash", user_id AS "userId", expires_at AS "expiresAt", consumed_at AS "consumedAt" FROM email_verification_tokens WHERE token_hash = $1`, [tokenHash]);
    return result.rows[0] ?? null;
  }

  async consumeVerificationTokenAndVerifyUser(tokenHash: string, consumedAt: Date): Promise<string | null> {
    return withTransaction(this.pool, async (client) => {
      const tokenResult = await client.query<{ userId: string }>(`UPDATE email_verification_tokens SET consumed_at = $2 WHERE token_hash = $1 AND consumed_at IS NULL AND expires_at > $2 RETURNING user_id AS "userId"`, [tokenHash, consumedAt]);
      const userId = tokenResult.rows[0]?.userId;
      if (!userId) return null;
      const userResult = await client.query(`UPDATE users SET email_verified_at = $2 WHERE id = $1`, [userId, consumedAt]);
      if (userResult.rowCount !== 1) throw new Error("verification user missing");
      return userId;
    });
  }

  async insertPasswordResetToken(token: PasswordResetToken): Promise<void> {
    await this.pool.query(`INSERT INTO password_reset_tokens (token_hash, user_id, expires_at) VALUES ($1, $2, $3)`, [token.tokenHash, token.userId, token.expiresAt]);
  }

  async consumePasswordResetAndUpdatePassword(tokenHash: string, consumedAt: Date, passwordHash: string): Promise<string | null> {
    return withTransaction(this.pool, async (client) => {
      const tokenResult = await client.query<{ userId: string }>(`UPDATE password_reset_tokens SET consumed_at = $2 WHERE token_hash = $1 AND consumed_at IS NULL AND expires_at > $2 RETURNING user_id AS "userId"`, [tokenHash, consumedAt]);
      const userId = tokenResult.rows[0]?.userId;
      if (!userId) return null;
      const userResult = await client.query(`UPDATE users SET password_hash = $2 WHERE id = $1`, [userId, passwordHash]);
      if (userResult.rowCount !== 1) throw new Error("password reset user missing");
      await client.query(`UPDATE sessions SET revoked_at = $2 WHERE user_id = $1 AND revoked_at IS NULL`, [userId, consumedAt]);
      return userId;
    });
  }

  async insertSession(session: Session): Promise<void> {
    await this.pool.query(`INSERT INTO sessions (id, user_id, token_hash, csrf_token, expires_at, created_at, revoked_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [session.id, session.userId, session.tokenHash, session.csrfToken, session.expiresAt, session.createdAt, session.revokedAt]);
  }

  async findSessionByTokenHash(tokenHash: string): Promise<Session | null> {
    const result = await this.pool.query<Session>(`SELECT id, user_id AS "userId", token_hash AS "tokenHash", csrf_token AS "csrfToken", expires_at AS "expiresAt", created_at AS "createdAt", revoked_at AS "revokedAt" FROM sessions WHERE token_hash = $1`, [tokenHash]);
    return result.rows[0] ?? null;
  }

  async revokeSession(session: Session, revokedAt: Date): Promise<void> {
    await this.pool.query(`UPDATE sessions SET revoked_at = $2 WHERE id = $1 AND revoked_at IS NULL`, [session.id, revokedAt]);
  }

  async revokeAllSessions(userId: string, revokedAt: Date): Promise<void> {
    await this.pool.query(`UPDATE sessions SET revoked_at = $2 WHERE user_id = $1 AND revoked_at IS NULL`, [userId, revokedAt]);
  }

  async insertAuditEvent(event: AuditEvent): Promise<void> {
    await this.pool.query(`INSERT INTO audit_logs (action, outcome, request_id, user_id, ip, metadata, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [event.action, event.outcome, event.requestId, event.userId ?? null, event.ip ?? null, event.metadata ?? null, event.createdAt]);
  }
}

function mapUser(row: UserRow): User {
  return { id: row.id, email: row.email, passwordHash: row.password_hash, emailVerifiedAt: row.email_verified_at, roles: row.roles ?? [], mfaEnabled: row.mfa_enabled, createdAt: row.created_at };
}

export async function withTransaction<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
