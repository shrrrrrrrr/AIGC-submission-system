import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { Secret, TOTP } from "otpauth";
import { AuthError } from "../src/auth/errors.js";
import { MfaService } from "../src/auth/mfa.js";
import { InMemoryAuthRepository } from "../src/auth/repository.js";
import type { User } from "../src/auth/types.js";

const cases: Array<[string, () => Promise<void>]> = [];
function test(name: string, fn: () => Promise<void>): void {
  cases.push([name, fn]);
}

function fixture(): { repository: InMemoryAuthRepository; mfa: MfaService; user: User } {
  const repository = new InMemoryAuthRepository();
  const user: User = {
    id: "00000000-0000-4000-8000-000000000001",
    email: "reviewer@example.com",
    passwordHash: "unused-in-this-test",
    emailVerifiedAt: new Date(),
    roles: ["reviewer"],
    mfaEnabled: false,
    mfaSecretCiphertext: null,
    mfaPendingSecretCiphertext: null,
    mfaLastUsedCounter: null,
    createdAt: new Date(),
  };
  repository.users.set(user.id, user);
  return { repository, mfa: new MfaService(repository, randomBytes(32)), user };
}

test("MFA enrollment stores an encrypted secret and returns a valid otpauth URI", async () => {
  const { repository, mfa, user } = fixture();
  const enrollment = await mfa.beginEnrollment(user);
  const credential = await repository.getMfaCredential(user.id);

  assert.match(enrollment.otpauthUri, /^otpauth:\/\/totp\//);
  assert.equal(credential?.enabled, false);
  assert.ok(credential?.pendingSecretCiphertext);
  assert.notEqual(credential?.pendingSecretCiphertext, enrollment.secret);

  const uriSecret = enrollment.otpauthUri.match(/[?&]secret=([^&]+)/)?.[1];
  assert.equal(uriSecret, enrollment.secret);
});

test("MFA confirmation accepts a current code and rejects code replay", async () => {
  const { repository, mfa, user } = fixture();
  const enrollment = await mfa.beginEnrollment(user);
  const now = Date.now();
  const totp = new TOTP({ secret: Secret.fromBase32(enrollment.secret), algorithm: "SHA1", digits: 6, period: 30 });
  const enrollmentCode = totp.generate({ timestamp: now });
  await mfa.confirmEnrollment(user, enrollmentCode);

  const enabled = await repository.getMfaCredential(user.id);
  assert.equal(enabled?.enabled, true);
  assert.equal(enabled?.pendingSecretCiphertext, null);

  const originalNow = Date.now;
  try {
    Date.now = () => now + 30_000;
    const nextCode = totp.generate({ timestamp: Date.now() });
    assert.equal(await mfa.verifyLogin(user, nextCode), true);
    assert.equal(await mfa.verifyLogin(user, nextCode), false);
  } finally {
    Date.now = originalNow;
  }
});

test("MFA enrollment is restricted to reviewer and administrator roles", async () => {
  const { mfa, user } = fixture();
  const participant: User = { ...user, roles: ["participant"] };
  await assert.rejects(() => mfa.beginEnrollment(participant), (error: unknown) => error instanceof AuthError && error.code === "MFA_FORBIDDEN" && error.status === 403);
});

for (const [name, run] of cases) {
  await run();
  console.log(`PASS ${name}`);
}
