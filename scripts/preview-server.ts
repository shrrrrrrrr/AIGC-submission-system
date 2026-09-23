import { randomBytes } from "node:crypto";
import { serve } from "@hono/node-server";
import { createApp } from "../src/app.js";
import { MfaService } from "../src/auth/mfa.js";
import { InMemoryAuthRepository } from "../src/auth/repository.js";
import { AuthService } from "../src/auth/service.js";
import { hashPassword } from "../src/auth/password.js";
import type { User } from "../src/auth/types.js";
import type { Submission } from "../src/submission/types.js";
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
const previewAdmin: User = {
  id: "00000000-0000-4000-8000-000000000092",
  email: "admin-preview@example.com",
  passwordHash: await hashPassword("123456"),
  emailVerifiedAt: new Date(),
  roles: ["event_admin"],
  mfaEnabled: true,
  mfaSecretCiphertext: null,
  mfaPendingSecretCiphertext: null,
  mfaLastUsedCounter: null,
  createdAt: new Date(),
};
await repository.insertUser(previewAdmin);

const previewSubmission: Submission = {
  id: "00000000-0000-4000-8000-000000000093",
  receiptNo: "CVR26-PREVIEW",
  ownerUserId: user.id,
  currentStatus: "submitted",
  currentVersionNo: 1,
  draftRevision: 3,
  draft: {
    title: "本地预览示例作品",
    direction: "frontier_tech",
    workForm: "animation",
    synopsis: "用于查看管理员审查界面的示例投稿。",
    creativeStatement: "本地预览数据，不代表真实投稿。",
    aiContributionPercent: 80,
    aiTools: ["本地预览"],
    aiWorkflow: "本地预览数据",
    humanContribution: "本地预览数据",
    rightsConfirmed: true,
    aiLabelConfirmed: true,
    templateConfirmed: true,
  },
  mediaLinks: [{
    id: "00000000-0000-4000-8000-000000000094",
    purpose: "mainWork",
    originalUrl: "https://www.douyin.com/video/preview",
    canonicalUrl: "https://www.douyin.com/video/preview",
    provider: "douyin",
    externalVideoId: "preview",
    isPubliclyAccessible: true,
    durationSeconds: 120,
    width: 1920,
    height: 1080,
    precheckStatus: "passed",
    failureCode: null,
    precheckFindings: [],
    checkedAt: new Date(),
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
  }],
  createdAt: new Date(),
  updatedAt: new Date(),
};
await submissionRepository.insert(previewSubmission);

const auth = new AuthService(repository, {
  async sendEmailVerification() {},
  async sendPasswordReset() {},
});
const submissions = new SubmissionService(submissionRepository, [
  "www.douyin.com", "douyin.com", "www.bilibili.com", "b23.tv", "www.xiaohongshu.com", "xhslink.com", "channels.weixin.qq.com",
], (event) => repository.insertAuditEvent(event));
const app = createApp({ auth, mfa, submissions, cookieSecurity: "preview", mfaVerifier: async (account, code) => account.email === previewAdmin.email && code === "000000" });
const port = 3000;
serve({ fetch: app.fetch, hostname: "127.0.0.1", port });
console.info(`ChinaVR local preview server: http://127.0.0.1:${port}`);
console.info("Preview participant: preview@example.com / 123456");
console.info("Preview admin: admin-preview@example.com / 123456 / MFA 000000");