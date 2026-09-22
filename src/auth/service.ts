import { AuthError, GENERIC_AUTH_ERROR } from "./errors.js";
import { hashOpaqueToken, newId, newOpaqueToken, normalizeEmail } from "./crypto.js";
import { hashPassword, verifyPassword } from "./password.js";
import type { AuthRepository } from "./repository.js";
import type { PasswordResetToken, Session, User, VerificationToken } from "./types.js";

const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$t8eh3ObJ2g6AYcderHtcYg$j4XUJ0rmLhurjhF8z3qn8sesmNuycwyiL52wALCbrv4";

export type Mailer = {
  sendEmailVerification(email: string, rawToken: string): Promise<void>;
  sendPasswordReset?(email: string, rawToken: string): Promise<void>;
};

export type Clock = {
  now(): Date;
};

export type MfaVerifier = (user: User, code: string) => Promise<boolean>;

export class AuthService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly mailer: Mailer,
    private readonly clock: Clock = { now: () => new Date() },
    private readonly sessionTtlSeconds = 28_800,
  ) {}

  async register(emailInput: string, password: string, requestId: string, ip?: string): Promise<void> {
    const email = normalizeEmail(emailInput);
    validateEmail(email);
    validatePassword(password);

    const existing = await this.repository.findUserByEmail(email);
    if (existing) {
      await this.audit("auth.register", "failure", requestId, ip, { reason: "duplicate_or_existing" });
      return;
    }

    const now = this.clock.now();
    const user: User = {
      id: newId(),
      email,
      passwordHash: await hashPassword(password),
      emailVerifiedAt: null,
      roles: ["participant"],
      mfaEnabled: false,
      mfaSecretCiphertext: null,
      mfaPendingSecretCiphertext: null,
      mfaLastUsedCounter: null,
      createdAt: now,
    };
    await this.repository.insertUser(user);

    const rawToken = newOpaqueToken();
    const verificationToken: VerificationToken = {
      tokenHash: hashOpaqueToken(rawToken),
      userId: user.id,
      expiresAt: new Date(now.getTime() + 30 * 60 * 1000),
      consumedAt: null,
    };
    await this.repository.insertVerificationToken(verificationToken);
    await this.mailer.sendEmailVerification(email, rawToken);
    await this.audit("auth.register", "success", requestId, ip, { userId: user.id });
  }

  async verifyEmail(rawToken: string, requestId: string, ip?: string): Promise<void> {
    const token = await this.repository.findVerificationToken(hashOpaqueToken(rawToken));
    const now = this.clock.now();
    if (!token || token.consumedAt || token.expiresAt <= now) {
      await this.audit("auth.verify_email", "failure", requestId, ip, { reason: "invalid_or_expired" });
      throw new AuthError("INVALID_VERIFICATION_TOKEN", 400, "验证链接无效或已过期");
    }

    const user = await this.repository.findUserById(token.userId);
    if (!user) {
      await this.audit("auth.verify_email", "failure", requestId, ip, { reason: "user_missing" });
      throw new AuthError("INVALID_VERIFICATION_TOKEN", 400, "验证链接无效或已过期");
    }

    const consumedUserId = await this.repository.consumeVerificationTokenAndVerifyUser(token.tokenHash, now);
    if (!consumedUserId || consumedUserId !== user.id) {
      await this.audit("auth.verify_email", "failure", requestId, ip, { reason: "already_consumed" });
      throw new AuthError("INVALID_VERIFICATION_TOKEN", 400, "验证链接无效或已过期");
    }
    await this.audit("auth.verify_email", "success", requestId, ip, { userId: user.id });
  }

  async login(
    emailInput: string,
    password: string,
    requestId: string,
    ip: string | undefined,
    allowLogin: () => boolean,
    resetLoginFailures: () => void,
    mfaCode?: string,
    mfaVerifier?: MfaVerifier,
  ): Promise<{ user: User; rawSessionToken: string; csrfToken: string; expiresAt: Date }> {
    if (!allowLogin()) {
      await this.audit("auth.login", "failure", requestId, ip, { reason: "rate_limited" });
      throw new AuthError("RATE_LIMITED", 429, "尝试次数过多，请稍后再试");
    }

    const email = normalizeEmail(emailInput);
    const user = await this.repository.findUserByEmail(email);
    const passwordHash = user?.passwordHash ?? DUMMY_PASSWORD_HASH;
    const passwordMatches = await verifyPassword(passwordHash, password);
    if (!user || !passwordMatches || !user.emailVerifiedAt) {
      await this.audit("auth.login", "failure", requestId, ip, { reason: "invalid_credentials" });
      throw new AuthError("INVALID_CREDENTIALS", 401, GENERIC_AUTH_ERROR);
    }

    const protectedRole = user.roles.some((role) => role === "reviewer" || role === "event_admin" || role === "super_admin");
    if (protectedRole && (!user.mfaEnabled || !mfaCode || !mfaVerifier || !(await mfaVerifier(user, mfaCode)))) {
      await this.audit("auth.login", "failure", requestId, ip, { reason: "mfa_required_or_invalid", userId: user.id });
      throw new AuthError("MFA_REQUIRED", 401, "该账号需要完成多因素认证");
    }

    resetLoginFailures();
    const now = this.clock.now();
    const rawSessionToken = newOpaqueToken();
    const csrfToken = newOpaqueToken(24);
    const expiresAt = new Date(now.getTime() + this.sessionTtlSeconds * 1000);
    const session: Session = {
      id: newId(),
      userId: user.id,
      tokenHash: hashOpaqueToken(rawSessionToken),
      csrfToken,
      expiresAt,
      createdAt: now,
      revokedAt: null,
    };
    await this.repository.insertSession(session);
    await this.audit("auth.login", "success", requestId, ip, { userId: user.id });
    return { user, rawSessionToken, csrfToken, expiresAt };
  }

  async getSession(rawSessionToken: string | undefined): Promise<{ session: Session; user: User } | null> {
    if (!rawSessionToken) return null;
    const session = await this.repository.findSessionByTokenHash(hashOpaqueToken(rawSessionToken));
    if (!session || session.revokedAt || session.expiresAt <= this.clock.now()) return null;
    const user = await this.repository.findUserById(session.userId);
    return user ? { session, user } : null;
  }

  async logout(session: Session, requestId: string, ip?: string): Promise<void> {
    await this.repository.revokeSession(session, this.clock.now());
    await this.audit("auth.logout", "success", requestId, ip, { userId: session.userId });
  }

  async requestPasswordReset(emailInput: string, requestId: string, ip?: string): Promise<void> {
    const email = normalizeEmail(emailInput);
    validateEmail(email);
    const user = await this.repository.findUserByEmail(email);
    if (!user || !this.mailer.sendPasswordReset) {
      await this.audit("auth.password_reset.request", "success", requestId, ip);
      return;
    }
    const now = this.clock.now();
    const rawToken = newOpaqueToken();
    const token: PasswordResetToken = {
      tokenHash: hashOpaqueToken(rawToken),
      userId: user.id,
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
      consumedAt: null,
    };
    await this.repository.insertPasswordResetToken(token);
    await this.mailer.sendPasswordReset(email, rawToken);
    await this.audit("auth.password_reset.request", "success", requestId, ip);
  }

  async confirmPasswordReset(rawToken: string, newPassword: string, requestId: string, ip?: string): Promise<void> {
    validatePassword(newPassword);
    const now = this.clock.now();
    const passwordHash = await hashPassword(newPassword);
    const userId = await this.repository.consumePasswordResetAndUpdatePassword(hashOpaqueToken(rawToken), now, passwordHash);
    if (!userId) {
      await this.audit("auth.password_reset.confirm", "failure", requestId, ip, { reason: "invalid_or_expired" });
      throw new AuthError("INVALID_PASSWORD_RESET_TOKEN", 400, "重置链接无效或已过期");
    }
    await this.audit("auth.password_reset.confirm", "success", requestId, ip, { userId });
  }

  private async audit(
    action: string,
    outcome: "success" | "failure",
    requestId: string,
    ip: string | undefined,
    metadata?: Record<string, string>,
  ): Promise<void> {
    const event = { action, outcome, requestId, createdAt: this.clock.now() } as Parameters<AuthRepository["insertAuditEvent"]>[0];
    if (ip !== undefined) event.ip = ip;
    if (metadata !== undefined) event.metadata = metadata;
    await this.repository.insertAuditEvent(event);
  }
}

function validateEmail(email: string): void {
  if (email.length < 3 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AuthError("INVALID_EMAIL", 422, "请输入有效邮箱");
  }
}

function validatePassword(password: string): void {
  if (password.length < 15 || password.length > 256) {
    throw new AuthError("INVALID_PASSWORD", 422, "密码长度需为 15 至 256 个字符");
  }
}
