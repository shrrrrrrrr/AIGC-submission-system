import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { InMemoryAuthRepository } from "../src/auth/repository.js";
import { AuthService } from "../src/auth/service.js";
import type { User } from "../src/auth/types.js";
import { SubmissionError } from "../src/submission/errors.js";
import { InMemorySubmissionRepository } from "../src/submission/repository.js";
import { SubmissionService } from "../src/submission/service.js";

const cases: Array<[string, () => Promise<void>]> = [];
function test(name: string, fn: () => Promise<void>): void {
  cases.push([name, fn]);
}

function userFixture(): User {
  return {
    id: "00000000-0000-4000-8000-000000000021",
    email: "creator@example.com",
    passwordHash: "unused-in-this-test",
    emailVerifiedAt: new Date("2026-09-23T00:00:00.000Z"),
    roles: ["participant"],
    mfaEnabled: false,
    mfaSecretCiphertext: null,
    mfaPendingSecretCiphertext: null,
    mfaLastUsedCounter: null,
    createdAt: new Date("2026-09-23T00:00:00.000Z"),
  };
}

test("draft creation is idempotent and optimistic concurrency rejects stale edits", async () => {
  const repository = new InMemorySubmissionRepository();
  const service = new SubmissionService(repository, ["video.example.test"]);
  const user = userFixture();
  const input = { title: "光场档案", direction: "frontier_tech" as const, workForm: "experimental" as const };

  const first = await service.createDraft(user, input, "create-key-001");
  const replay = await service.createDraft(user, input, "create-key-001");
  assert.equal(replay.id, first.id);
  await assert.rejects(() => service.createDraft(user, { ...input, title: "另一份作品" }, "create-key-001"), (error: unknown) => error instanceof SubmissionError && error.code === "IDEMPOTENCY_KEY_REUSED");

  const updated = await service.patchDraft(user, first.id, { synopsis: "一段用于验证草稿保存的作品简介。" }, '"1"');
  assert.equal(updated.draftRevision, 2);
  await assert.rejects(() => service.patchDraft(user, first.id, { synopsis: "旧页面覆盖" }, '"1"'), (error: unknown) => error instanceof SubmissionError && error.code === "DRAFT_CONFLICT");
});

test("media link remains pending until a worker verifies it and retries are idempotent", async () => {
  const repository = new InMemorySubmissionRepository();
  const service = new SubmissionService(repository, ["video.example.test"]);
  const user = userFixture();
  const draft = await service.createDraft(user, { title: "链接测试", direction: "science_fiction", workForm: "vr" }, "create-key-002");
  const first = await service.upsertMediaLink(user, draft.id, "mainWork", "https://video.example.test/watch/abc", '"1"', "link-key-001");
  assert.equal(first.link.precheckStatus, "pending");
  assert.equal(first.submission.draftRevision, 2);
  const replay = await service.upsertMediaLink(user, draft.id, "mainWork", "https://video.example.test/watch/abc", '"1"', "link-key-001");
  assert.equal(replay.link.id, first.link.id);
  assert.equal(replay.submission.draftRevision, 2);
  await assert.rejects(() => service.upsertMediaLink(user, draft.id, "mainWork", "http://video.example.test/watch/abc", '"2"', "link-key-002"), (error: unknown) => error instanceof SubmissionError && error.code === "UNSAFE_URL");
  await assert.rejects(() => service.upsertMediaLink(user, draft.id, "mainWork", "https://unapproved.example/watch/abc", '"2"', "link-key-003"), (error: unknown) => error instanceof SubmissionError && error.code === "UNSUPPORTED_PLATFORM");
});

test("link precheck never claims pass without platform metadata", async () => {
  const repository = new InMemorySubmissionRepository();
  const service = new SubmissionService(repository, ["www.bilibili.com"]);
  const user = userFixture();
  const draft = await service.createDraft(user, { title: "预检测试", direction: "frontier_tech", workForm: "animation" }, "precheck-create");
  const saved = await service.upsertMediaLink(user, draft.id, "mainWork", "https://www.bilibili.com/video/BV1xx#tracking", '"1"', "precheck-link");
  const result = await service.precheckMediaLink(user, draft.id, saved.link.id, new Date("2026-09-23T01:00:00.000Z"));
  assert.equal(result.link.provider, "bilibili");
  assert.equal(result.link.canonicalUrl, "https://www.bilibili.com/video/BV1xx");
  assert.equal(result.link.precheckStatus, "failed");
  assert.equal(result.link.failureCode, "METADATA_UNAVAILABLE");
  await assert.rejects(() => service.precheckMediaLink(user, draft.id, "00000000-0000-4000-8000-000000000099"), { code: "MEDIA_LINK_NOT_FOUND" });
});

test("complete draft can be submitted once and becomes read only", async () => {
  const repository = new InMemorySubmissionRepository();
  const service = new SubmissionService(repository, ["video.example.test"]);
  const user = userFixture();
  const draft = await service.createDraft(user, { title: "最小投稿", direction: "frontier_tech", workForm: "animation" }, "submit-create");
  const linked = await service.upsertMediaLink(user, draft.id, "mainWork", "https://video.example.test/watch/submit", '"1"', "submit-link");
  const ready = await service.patchDraft(user, draft.id, { rightsConfirmed: true, aiLabelConfirmed: true }, '"2"');
  const submitted = await service.submit(user, draft.id, '"3"');
  assert.equal(linked.submission.draftRevision, 2);
  assert.equal(ready.draftRevision, 3);
  assert.equal(submitted.currentStatus, "submitted");
  assert.equal(submitted.draftRevision, 4);
  await assert.rejects(() => service.submit(user, draft.id, '"4"'), { code: "SUBMISSION_NOT_EDITABLE" });
});

test("admin submission review requires MFA and protects status transitions", async () => {
  const repository = new InMemorySubmissionRepository();
  const service = new SubmissionService(repository);
  const participant = userFixture();
  const draft = await service.createDraft(participant, { title: "管理员审核", direction: "frontier_tech", workForm: "animation" }, "admin-review-create");
  await repository.update({ ...draft, currentStatus: "submitted", updatedAt: new Date("2026-09-23T02:00:00.000Z") });
  const admin: User = { ...participant, id: "00000000-0000-4000-8000-000000000023", roles: ["event_admin"], mfaEnabled: true };

  assert.equal((await service.adminList(admin))[0]?.id, draft.id);
  const detail = await service.adminGet(admin, draft.id);
  assert.equal(detail.currentStatus, "submitted");
  const moved = await service.adminTransition(admin, draft.id, "qualification_pass", "材料完整，进入资格通过", "submitted", new Date("2026-09-23T02:01:00.000Z"));
  assert.equal(moved.currentStatus, "qualification_pass");
  await assert.rejects(() => service.adminTransition(admin, draft.id, "reviewing", "重复处理", "submitted"), (error: unknown) => error instanceof SubmissionError && error.code === "STATUS_CONFLICT");
  await assert.rejects(() => service.adminList({ ...admin, mfaEnabled: false }), (error: unknown) => error instanceof SubmissionError && error.code === "MFA_REQUIRED");
  await assert.rejects(() => service.adminList(participant), (error: unknown) => error instanceof SubmissionError && error.code === "ADMIN_FORBIDDEN");
});

test("submission API applies session CSRF, idempotency and ETag headers", async () => {
  const authRepository = new InMemoryAuthRepository();
  const submissionRepository = new InMemorySubmissionRepository();
  const sent: string[] = [];
  const auth = new AuthService(authRepository, {
    async sendEmailVerification(_email, token) { sent.push(token); },
    async sendPasswordReset() {},
  });
  const app = createApp({ auth, submissions: new SubmissionService(submissionRepository, ["video.example.test"], (event) => authRepository.insertAuditEvent(event)) });
  const email = "api-creator@example.com";
  const password = "a long safe 密码 789";
  await app.request("http://localhost/api/v1/auth/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
  await app.request(`http://localhost/api/v1/auth/verify-email?token=${sent[0]}`);
  const login = await app.request("http://localhost/api/v1/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
  assert.equal(login.status, 200);
  const cookieHeader = login.headers.getSetCookie().map((cookie) => cookie.split(";")[0]).join("; ");
  const csrf = cookieHeader.match(/chinavr-csrf=([^;]+)/)?.[1];
  const registered = [...authRepository.users.values()][0]!;
  authRepository.users.set(registered.id, { ...registered, roles: ["participant", "event_admin"], mfaEnabled: true });
  const headers = { "content-type": "application/json", cookie: cookieHeader, "x-csrf-token": csrf!, "idempotency-key": "api-create-key" };
  const create = await app.request("http://localhost/api/v1/submissions", { method: "POST", headers, body: JSON.stringify({ title: "API 作品", direction: "traditional_culture", workForm: "animation" }) });
  assert.equal(create.status, 201);
  assert.equal(create.headers.get("etag"), '"1"');
  assert.equal(authRepository.auditEvents.some((event) => event.action === "submission.create_draft" && event.outcome === "success"), true);
  const body = (await create.json()) as { submission: { id: string } };
  const list = await app.request("http://localhost/api/v1/submissions", { headers: { cookie: cookieHeader } });
  assert.equal(list.status, 200);
  assert.equal(((await list.json()) as { items: Array<{ id: string }> }).items[0]?.id, body.submission.id);
  const adminList = await app.request("http://localhost/api/v1/admin/submissions", { headers: { cookie: cookieHeader } });
  assert.equal(adminList.status, 200);
  assert.equal(((await adminList.json()) as { items: Array<{ id: string }> }).items[0]?.id, body.submission.id);
  const adminDetail = await app.request(`http://localhost/api/v1/admin/submissions/${body.submission.id}`, { headers: { cookie: cookieHeader } });
  assert.equal(adminDetail.status, 200);
  const adminDetailBody = (await adminDetail.json()) as { submission: { mediaLinks: Array<Record<string, unknown>> } };
  assert.equal("originalUrl" in (adminDetailBody.submission.mediaLinks[0] ?? {}), false);
  const missingCsrf = await app.request("http://localhost/api/v1/submissions", { method: "POST", headers: { "content-type": "application/json", cookie: cookieHeader, "idempotency-key": "api-create-key-2" }, body: JSON.stringify({ title: "缺少 CSRF", direction: "frontier_tech", workForm: "animation" }) });
  assert.equal(missingCsrf.status, 403);
});

test("concurrent creates deduplicate and concurrent saves cannot overwrite each other", async () => {
  const repository = new InMemorySubmissionRepository();
  const services = [new SubmissionService(repository), new SubmissionService(repository)];
  const user = userFixture();
  const input = { title: "并发作品", direction: "science_fiction" as const, workForm: "vr" as const };
  const creates = await Promise.all(services.map((service) => service.createDraft(user, input, "concurrent-create")));
  assert.equal(creates[0]!.id, creates[1]!.id);
  assert.equal(repository.submissions.size, 1);
  const saves = await Promise.allSettled(services.map((service, index) => service.patchDraft(user, creates[0]!.id, { title: `页面 ${index}` }, '"1"')));
  assert.equal(saves.filter((save) => save.status === "fulfilled").length, 1);
  const rejected = saves.find((save) => save.status === "rejected");
  assert.equal(rejected?.reason.code, "DRAFT_CONFLICT");
  assert.equal((await services[0]!.get(user, creates[0]!.id)).draftRevision, 2);
});

test("ownership, verified participant role and draft state are checked on every mutation", async () => {
  const repository = new InMemorySubmissionRepository();
  const service = new SubmissionService(repository);
  const owner = userFixture();
  const draft = await service.createDraft(owner, { title: "归属验证", direction: "frontier_tech", workForm: "animation" }, "owner-create");
  const stranger = { ...owner, id: "00000000-0000-4000-8000-000000000022" };
  await assert.rejects(() => service.get(stranger, draft.id), { code: "SUBMISSION_NOT_FOUND" });
  await assert.rejects(() => service.patchDraft(stranger, draft.id, { title: "非法修改" }, '"1"'), { code: "SUBMISSION_NOT_FOUND" });
  await assert.rejects(() => service.patchDraft({ ...owner, roles: ["reviewer"] }, draft.id, { title: "角色已撤销" }, '"1"'), { code: "SUBMISSION_FORBIDDEN" });
  await assert.rejects(() => service.get({ ...owner, emailVerifiedAt: null }, draft.id), { code: "EMAIL_VERIFICATION_REQUIRED" });
  await repository.update({ ...draft, currentStatus: "submitted" });
  await assert.rejects(() => service.patchDraft(owner, draft.id, { title: "不能覆盖版本" }, '"1"'), { code: "SUBMISSION_NOT_EDITABLE" });
});

test("failed audit rolls back draft and idempotency writes", async () => {
  const repository = new InMemorySubmissionRepository();
  const service = new SubmissionService(repository, [], async () => { throw new Error("audit unavailable"); });
  await assert.rejects(() => service.createDraft(userFixture(), { title: "回滚测试", direction: "frontier_tech", workForm: "animation" }, "rollback-create", new Date(), { requestId: "audit-failure" }));
  assert.equal(repository.submissions.size, 0);
  assert.equal(repository.idempotency.size, 0);
});

test("concurrent link retries reuse the original response and keys cannot cross resources", async () => {
  const repository = new InMemorySubmissionRepository();
  const service = new SubmissionService(repository, ["video.example.test", "[::1]"]);
  const user = userFixture();
  const input = { title: "重试边界", direction: "frontier_tech" as const, workForm: "animation" as const };
  const draft = await service.createDraft(user, input, "retry-create");
  const saves = await Promise.all([1, 2].map(() => service.upsertMediaLink(user, draft.id, "mainWork", "https://video.example.test/first", '"1"', "retry-link")));
  assert.equal(saves[0]!.link.id, saves[1]!.link.id);
  assert.equal(saves[1]!.submission.draftRevision, 2);
  await service.upsertMediaLink(user, draft.id, "mainWork", "https://video.example.test/changed", '"2"', "changed-link");
  const replay = await service.upsertMediaLink(user, draft.id, "mainWork", "https://video.example.test/first", '"1"', "retry-link");
  assert.equal(replay.link.originalUrl, "https://video.example.test/first");
  assert.equal((await service.get(user, draft.id)).mediaLinks[0]!.originalUrl, "https://video.example.test/changed");
  const other = await service.createDraft(user, input, "other-create");
  await assert.rejects(() => service.upsertMediaLink(user, other.id, "mainWork", "https://video.example.test/first", '"1"', "retry-link"), { code: "IDEMPOTENCY_KEY_REUSED" });
  for (const url of ["https://[::1]/", "https://127.0.0.1/", "https://user:pass@video.example.test/", "https://video.example.test:8443/"]) {
    await assert.rejects(() => service.upsertMediaLink(user, other.id, "mainWork", url, '"1"', "invalid-link"), { code: "UNSAFE_URL" });
  }
});

for (const [name, run] of cases) {
  await run();
  console.log(`PASS ${name}`);
}
