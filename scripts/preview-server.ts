import { randomBytes } from "node:crypto";
import { serve } from "@hono/node-server";
import { createApp } from "../src/app.js";
import { MfaService } from "../src/auth/mfa.js";
import { InMemoryAuthRepository } from "../src/auth/repository.js";
import { AuthService } from "../src/auth/service.js";
import { hashPassword } from "../src/auth/password.js";
import type { User } from "../src/auth/types.js";
import { InMemorySubmissionRepository } from "../src/submission/repository.js";
import { SubmissionService } from "../src/submission/service.js";

// This server is intentionally loopback-only and memory-only. It is for previewing
// authenticated screens and must never be used as a deployment entrypoint.
const repository = new InMemoryAuthRepository();
const submissionRepository = new InMemorySubmissionRepository();
const mfa = new MfaService(repository, randomBytes(32));
const user: User = {
  id: "00000000-0000-4000-8000-000000000091",
  email: "preview@example.com",
  passwordHash: await hashPassword("123456"),
  emailVerifiedAt: new Date(),
  roles: ["participant"],
  mfaEnabled: false,
  mfaSecretCiphertext: null,
  mfaPendingSecretCiphertext: null,
  mfaLastUsedCounter: null,
  createdAt: new Date(),
};
await repository.insertUser(user);

const auth = new AuthService(repository, {
  async sendEmailVerification() {},
  async sendPasswordReset() {},
});
const submissions = new SubmissionService(submissionRepository, [
  "www.douyin.com", "douyin.com", "www.bilibili.com", "b23.tv", "www.xiaohongshu.com", "xhslink.com", "channels.weixin.qq.com",
], (event) => repository.insertAuditEvent(event));
const app = createApp({ auth, mfa, submissions, cookieSecurity: "preview" });
const port = 3000;
serve({ fetch: app.fetch, hostname: "127.0.0.1", port });
console.info(`ChinaVR local preview server: http://127.0.0.1:${port}`);
console.info("Preview participant: preview@example.com / 123456");