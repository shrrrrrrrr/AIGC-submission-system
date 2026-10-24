import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import type { Pool } from "pg";
import { createApp } from "../src/app.js";
import { AuthService } from "../src/auth/service.js";
import { InMemoryAuthRepository } from "../src/auth/repository.js";
import { InMemorySubmissionRepository } from "../src/submission/repository.js";
import { PostgresSubmissionRepository } from "../src/submission/postgres-repository.js";
import { SubmissionService } from "../src/submission/service.js";
import { SUBMISSION_DEADLINE } from "../src/submission/deadline.js";
import type { Submission } from "../src/submission/types.js";

const deadline = Date.parse(SUBMISSION_DEADLINE);
assert.equal(new Date(deadline).toISOString(), "2026-10-20T16:00:00.000Z");
let now = deadline - 1;
const users = new InMemoryAuthRepository();
const records = new InMemorySubmissionRepository();
const service = new SubmissionService(records, ["www.bilibili.com"], event => users.insertAuditEvent(event), () => new Date(now));
let token = "";
const auth = new AuthService(users, { async sendEmailVerification(_email, value) { token = value; }, async sendPasswordReset() {} });
const app = createApp({ auth, submissions: service });
const json = { "content-type": "application/json" };
const credentials = { email: "deadline-test@example.com", password: "Deadline-test-long-password-123" };
await auth.register(credentials.email, credentials.password, "register-deadline");
await auth.verifyEmail(token, "verify-deadline");
const login = await app.request("/api/v1/auth/login", { method: "POST", headers: json, body: JSON.stringify(credentials) });
assert.equal(login.status, 200);
const cookie = login.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
const csrf = cookie.match(/chinavr-csrf=([^;]+)/)![1]!;
const user = [...users.users.values()][0]!;
const input = { title: "截止边界作品", direction: "frontier_tech" as const, workForm: "animation" as const };
const request = (path: string, method = "GET", data?: unknown, headers: Record<string, string> = {}) => app.request("/api/v1" + path, {
  method, headers: { ...json, cookie, "x-csrf-token": csrf, ...headers }, ...(data === undefined ? {} : { body: JSON.stringify(data) }),
});
const ready = async (title: string): Promise<Submission> => {
  const draft = await service.createDraft(user, { ...input, title }, randomUUID());
  const media = ["mainWork", "makingOf"].map(purpose => ({
    id: randomUUID(), purpose: purpose as "mainWork" | "makingOf", originalUrl: "https://www.bilibili.com/video/BV1",
    canonicalUrl: null, provider: "bilibili", externalVideoId: null, isPubliclyAccessible: null, durationSeconds: null,
    width: null, height: null, precheckStatus: "pending" as const, failureCode: null, precheckFindings: [],
    checkedAt: null, expiresAt: null,
  }));
  const value = { ...draft, mediaLinks: media, draft: { ...draft.draft, synopsis: "完整作品简介", creativeStatement: "完整创作说明",
    aiContributionPercent: 90, aiTools: ["测试工具"], aiWorkflow: "生成与制作流程", humanContribution: "剪辑与声音设计", rightsConfirmed: true, aiLabelConfirmed: true } };
  await records.update(value);
  return value;
};

assert.equal(((await (await request("/submission-window")).json()) as { closed: boolean }).closed, false);
const accepted = await ready('已投递作品 <img src=x onerror="alert(1)">');
const draft = await ready("未提交草稿");
const submitted = await service.submit(user, accepted.id, '"1"');
assert.equal(submitted.currentStatus, "submitted");
const other = { ...submitted, id: randomUUID(), receiptNo: "CVR26-OTHER", ownerUserId: randomUUID(), draft: { ...submitted.draft, title: "其他账号的私有作品" } };
await records.insert(other);
const snapshot = structuredClone([...records.submissions]);
const idempotencySnapshot = structuredClone([...records.idempotency]);
now = deadline;
const windowResponse = await request("/submission-window");
assert.equal(windowResponse.headers.get("cache-control"), "no-store");
assert.equal((await windowResponse.json() as { closed: boolean }).closed, true);

for (const [path, method, body, headers] of [
  ["/submissions", "POST", input, { "Idempotency-Key": "after-deadline-new" }],
  [`/submissions/${draft.id}/draft`, "PATCH", { title: "不能修改" }, { "If-Match": '"1"' }],
  [`/submissions/${draft.id}/media-links`, "POST", { purpose: "mainWork", url: "https://www.bilibili.com/video/BV2" }, { "If-Match": '"1"', "Idempotency-Key": "after-deadline-link" }],
  [`/submissions/${draft.id}/media-links/${draft.mediaLinks[0]!.id}/prechecks`, "POST", undefined, {}],
  [`/submissions/${draft.id}/submit`, "POST", undefined, { "If-Match": '"1"' }],
] as const) {
  const response = await request(path, method, body, headers);
  assert.equal(response.status, 403, path);
  assert.equal((await response.json() as { code: string }).code, "SUBMISSION_CLOSED", path);
}
assert.deepEqual([...records.submissions], snapshot, "截止拒绝不能改变任何现有稿件");
assert.deepEqual([...records.idempotency], idempotencySnapshot);
assert.equal((await request(`/submissions/${draft.id}`)).status, 200);
assert.equal((await request(`/submissions/${other.id}`)).status, 404);
assert.equal((await app.request("/api/v1/submissions/receipts")).status, 401);
const receipts = await request("/submissions/receipts");
assert.equal(receipts.headers.get("cache-control"), "no-store");
const receiptBody = await receipts.json() as { items: Array<{ id: string; title: string }> };
assert.deepEqual(receiptBody.items.map((item: { id: string }) => item.id), [accepted.id]);
assert.equal(receiptBody.items[0]!.title, accepted.draft.title);
assert.ok(!JSON.stringify(receiptBody).includes("其他账号"));
assert.ok(!JSON.stringify(receiptBody).includes("passwordHash"));
assert.ok(!JSON.stringify(receiptBody).includes("未提交草稿"));
assert.equal((await request("/admin/submissions/table")).status, 403);
users.users.set(user.id, { ...user, roles: ["super_admin"], mfaEnabled: true });
assert.equal((await request("/admin/submissions")).status, 200);
assert.equal((await request(`/admin/submissions/${draft.id}`)).status, 200);
assert.equal((await request("/admin/submissions/export", "POST")).status, 200);
const exported = await request("/admin/submissions/table/export", "POST", {});
assert.equal(exported.status, 200);
const workbook = new ExcelJS.Workbook();
await workbook.xlsx.load(await exported.arrayBuffer());
assert.equal(workbook.getWorksheet("投稿汇总")!.rowCount, 3);
assert.equal((await request("/admin/submissions/table/export", "POST", {}, { "x-csrf-token": "wrong" })).status, 403);
assert.deepEqual([...records.submissions], snapshot, "管理员查看和导出不能修改稿件");
assert.equal((await request(`/admin/submissions/${accepted.id}/transitions`, "POST", {
  targetStatus: "qualification_pass", expectedStatus: "submitted", reason: "资格审核通过",
})).status, 200);
users.users.set(user.id, { ...user, roles: ["super_admin"], mfaEnabled: false });
assert.equal((await request("/admin/submissions/table")).status, 403);
console.log("PASS 截止瞬间/直调接口/草稿冻结/既有数据不变/个人回执隔离/管理员查看导出和权限");

// A request may begin before midnight and acquire its quota lock afterwards.
now = deadline - 1;
const queued = await ready("跨截止排队作品");
const originalTransaction = records.transaction.bind(records);
records.transaction = operation => originalTransaction(async (transaction, context) => {
  transaction.lockSubmissionQuota = async () => { now = deadline; };
  return operation(transaction, context);
});
await assert.rejects(() => service.submit(user, queued.id, '"1"', new Date(deadline - 60_000)), { code: "SUBMISSION_CLOSED" });
assert.equal((await records.findById(queued.id))!.submittedAt, null);
records.transaction = operation => originalTransaction(async (transaction, context) => {
  now = deadline;
  return operation(transaction, context);
});
now = deadline - 1;
const count = records.submissions.size;
await assert.rejects(() => service.createDraft(user, input, "queued-create-key", new Date(deadline - 60_000)), { code: "SUBMISSION_CLOSED" });
assert.equal(records.submissions.size, count);
console.log("PASS 等待事务和配额锁跨过截止时刻，旧请求时间不能绕过截止");

const sql: string[] = [];
const pool = { connect: async () => ({
  query: async (query: string) => { sql.push(query.trim()); return { rows: [], rowCount: 0 }; },
  release() {},
}) } as unknown as Pool;
const postgresService = new SubmissionService(new PostgresSubmissionRepository(pool), [], undefined, () => new Date(deadline));
await assert.rejects(() => postgresService.createDraft(user, input, "postgres-closed-key"), { code: "SUBMISSION_CLOSED" });
assert.deepEqual(sql, ["BEGIN", "ROLLBACK"]);
console.log("PASS PostgreSQL 截止请求回滚，无 INSERT/UPDATE/DELETE");
