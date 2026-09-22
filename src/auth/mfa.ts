import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { Secret, TOTP } from "otpauth";
import { AuthError } from "./errors.js";
import type { AuthRepository } from "./repository.js";
import type { User } from "./types.js";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

export class MfaService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly encryptionKey: Buffer,
    private readonly issuer = "ChinaVR 2026",
  ) {
    if (encryptionKey.length !== 32) throw new Error("MFA_ENCRYPTION_KEY must be exactly 32 bytes");
  }

  async beginEnrollment(user: User): Promise<{ secret: string; otpauthUri: string }> {
    requireProtectedRole(user);
    const secret = new Secret({ size: 20 });
    const totp = new TOTP({ issuer: this.issuer, label: user.email, secret, algorithm: "SHA1", digits: 6, period: 30 });
    await this.repository.saveMfaPendingSecret(user.id, this.encrypt(secret.base32));
    return { secret: secret.base32, otpauthUri: totp.toString() };
  }

  async confirmEnrollment(user: User, code: string): Promise<void> {
    requireProtectedRole(user);
    const credential = await this.repository.getMfaCredential(user.id);
    if (!credential?.pendingSecretCiphertext) throw new AuthError("MFA_ENROLLMENT_NOT_STARTED", 409, "请先开始 MFA 注册");
    const secret = this.decrypt(credential.pendingSecretCiphertext);
    const totp = new TOTP({ secret, algorithm: "SHA1", digits: 6, period: 30 });
    const timestamp = Date.now();
    const delta = totp.validate({ token: code, timestamp, window: 1 });
    if (delta === null) throw new AuthError("MFA_CODE_INVALID", 422, "验证码无效或已过期");
    await this.repository.activateMfa(user.id, credential.pendingSecretCiphertext, totp.counter({ timestamp }) + delta);
  }

  async verifyLogin(user: User, code: string): Promise<boolean> {
    requireProtectedRole(user);
    const credential = await this.repository.getMfaCredential(user.id);
    if (!credential?.enabled || !credential.secretCiphertext) return false;
    const secret = this.decrypt(credential.secretCiphertext);
    const timestamp = Date.now();
    const totp = new TOTP({ secret, algorithm: "SHA1", digits: 6, period: 30 });
    const delta = totp.validate({ token: code, timestamp, window: 1 });
    if (delta === null) return false;
    return this.repository.consumeMfaCounter(user.id, totp.counter({ timestamp }) + delta);
  }

  private encrypt(plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.encryptionKey, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url");
  }

  private decrypt(encoded: string): string {
    const packed = Buffer.from(encoded, "base64url");
    if (packed.length <= IV_BYTES + TAG_BYTES) throw new Error("MFA secret ciphertext is invalid");
    const iv = packed.subarray(0, IV_BYTES);
    const authTag = packed.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const ciphertext = packed.subarray(IV_BYTES + TAG_BYTES);
    const decipher = createDecipheriv(ALGORITHM, this.encryptionKey, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  }
}

function requireProtectedRole(user: User): void {
  if (!user.roles.some((role) => role === "reviewer" || role === "event_admin" || role === "super_admin")) {
    throw new AuthError("MFA_FORBIDDEN", 403, "只有评审或管理员账号可以配置多因素认证");
  }
}
