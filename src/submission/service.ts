import { isIP } from "node:net";
import { newId, newOpaqueToken } from "../auth/crypto.js";
import type { AuditEvent, User } from "../auth/types.js";
import { SubmissionError } from "./errors.js";
import type { SubmissionRepository, SubmissionTransactionContext } from "./repository.js";
import type { CreateDraftInput, DraftPatch, MediaLink, MediaPurpose, Submission, SubmissionDirection, SubmissionDraft, SubmissionStatus, WorkForm } from "./types.js";
import { MEDIA_PURPOSES, SUBMISSION_DIRECTIONS, SUBMISSION_STATUSES, WORK_FORMS } from "./types.js";
import { inspectVideoLink } from "./precheck.js";

export class SubmissionService {
  constructor(private readonly repository: SubmissionRepository, approvedVideoHosts: readonly string[] = [], private readonly auditWriter?: (event: AuditEvent) => Promise<void>) {
    this.approvedVideoHosts = new Set(approvedVideoHosts.map((host) => host.trim().toLowerCase()).filter(Boolean));
  }

  private readonly approvedVideoHosts: Set<string>;

  async createDraft(user: User, input: CreateDraftInput, idempotencyKey: string, now = new Date(), context?: SubmissionRequestContext): Promise<Submission> {
    return this.repository.transaction(async (repository, transactionContext) => {
      requireParticipant(user);
      const key = normalizeIdempotencyKey(idempotencyKey);
      validateCreateInput(input);
      const fingerprint = JSON.stringify({ operation: "createDraft", title: input.title.trim(), direction: input.direction, workForm: input.workForm });
      const existing = await repository.findIdempotency(user.id, key);
      if (existing) {
        if (existing.fingerprint !== fingerprint || !existing.submissionId) throw new SubmissionError("IDEMPOTENCY_KEY_REUSED", 409, "幂等键已用于其他请求");
        const replay = existing.response;
        if (!replay) throw new SubmissionError("IDEMPOTENCY_RECORD_INVALID", 409, "请求状态需要重试");
        return replay;
      }

      const submission: Submission = {
        id: newId(),
        receiptNo: await this.nextReceiptNo(repository),
        ownerUserId: user.id,
        currentStatus: "draft",
        currentVersionNo: 1,
        draftRevision: 1,
        draft: {
          title: input.title.trim(),
          direction: input.direction,
          workForm: input.workForm,
          synopsis: "",
          creativeStatement: "",
          aiContributionPercent: null,
          aiTools: [],
          aiWorkflow: "",
          humanContribution: "",
          rightsConfirmed: false,
          aiLabelConfirmed: false,
          templateConfirmed: null,
        },
        mediaLinks: [],
        createdAt: now,
        updatedAt: now,
      };
      await repository.insert(submission);
      await repository.saveIdempotency({ ownerUserId: user.id, key, fingerprint, submissionId: submission.id, response: submission });
      await this.audit("submission.create_draft", user, submission, context, undefined, transactionContext);
      return submission;
    });
  }

  async list(user: User): Promise<Submission[]> {
    requireParticipant(user);
    return this.repository.listByOwner(user.id);
  }

  async get(user: User, submissionId: string): Promise<Submission> {
    return getOwned(this.repository, user, submissionId);
  }

  async patchDraft(user: User, submissionId: string, patch: DraftPatch, ifMatch: string | undefined, now = new Date(), context?: SubmissionRequestContext): Promise<Submission> {
    return this.repository.transaction(async (repository, transactionContext) => {
      const submission = await getOwned(repository, user, submissionId);
      requireEditable(submission);
      assertRevision(submission.draftRevision, ifMatch);
      validateDraftPatch(patch);
      const nextDraft: SubmissionDraft = {
        title: patch.title === undefined ? submission.draft.title : patch.title.trim(),
        direction: patch.direction === undefined ? submission.draft.direction : patch.direction,
        workForm: patch.workForm === undefined ? submission.draft.workForm : patch.workForm,
        synopsis: patch.synopsis === undefined ? submission.draft.synopsis : patch.synopsis.trim(),
        creativeStatement: patch.creativeStatement === undefined ? submission.draft.creativeStatement : patch.creativeStatement.trim(),
        aiContributionPercent: patch.aiContributionPercent === undefined ? submission.draft.aiContributionPercent : patch.aiContributionPercent,
        aiTools: patch.aiTools === undefined ? [...submission.draft.aiTools] : patch.aiTools.map((tool) => tool.trim()),
        aiWorkflow: patch.aiWorkflow === undefined ? submission.draft.aiWorkflow : patch.aiWorkflow.trim(),
        humanContribution: patch.humanContribution === undefined ? submission.draft.humanContribution : patch.humanContribution.trim(),
        rightsConfirmed: patch.rightsConfirmed === undefined ? submission.draft.rightsConfirmed : patch.rightsConfirmed,
        aiLabelConfirmed: patch.aiLabelConfirmed === undefined ? submission.draft.aiLabelConfirmed : patch.aiLabelConfirmed,
        templateConfirmed: patch.templateConfirmed === undefined ? submission.draft.templateConfirmed : patch.templateConfirmed,
      };
      const updated = { ...submission, draft: nextDraft, draftRevision: submission.draftRevision + 1, updatedAt: now };
      await repository.update(updated);
      await this.audit("submission.update_draft", user, updated, context, undefined, transactionContext);
      return updated;
    });
  }

  async upsertMediaLink(user: User, submissionId: string, purpose: MediaPurpose, originalUrl: string, ifMatch: string | undefined, idempotencyKey: string, now = new Date(), context?: SubmissionRequestContext): Promise<{ submission: Submission; link: MediaLink }> {
    return this.repository.transaction(async (repository, transactionContext) => {
      const submission = await getOwned(repository, user, submissionId);
      requireEditable(submission);
      if (!isMediaPurpose(purpose)) throw new SubmissionError("VALIDATION_ERROR", 422, "链接用途无效", [{ field: "purpose", reason: "INVALID_ENUM" }]);
      const key = normalizeIdempotencyKey(idempotencyKey);
      const trimmedUrl = validateAndNormalizeVideoUrl(originalUrl, this.approvedVideoHosts);
      const fingerprint = JSON.stringify({ operation: "mediaLink", submissionId, purpose, url: trimmedUrl });
      const existing = await repository.findIdempotency(user.id, key);
      if (existing) {
        if (existing.fingerprint !== fingerprint || !existing.mediaLinkId) throw new SubmissionError("IDEMPOTENCY_KEY_REUSED", 409, "幂等键已用于其他请求");
        const replay = existing.response;
        const replayLink = replay?.mediaLinks.find((link) => link.id === existing.mediaLinkId);
        if (!replay || !replayLink) throw new SubmissionError("IDEMPOTENCY_RECORD_INVALID", 409, "请求状态需要重试");
        return { submission: replay, link: replayLink };
      }
      assertRevision(submission.draftRevision, ifMatch);

      const oldLink = submission.mediaLinks.find((link) => link.purpose === purpose);
      const link: MediaLink = oldLink ? { ...oldLink, originalUrl: trimmedUrl, canonicalUrl: null, provider: null, externalVideoId: null, isPubliclyAccessible: null, durationSeconds: null, width: null, height: null, precheckStatus: "pending", failureCode: null, precheckFindings: [], checkedAt: null, expiresAt: null } : {
        id: newId(),
        purpose,
        originalUrl: trimmedUrl,
        canonicalUrl: null,
        provider: null,
        externalVideoId: null,
        isPubliclyAccessible: null,
        durationSeconds: null,
        width: null,
        height: null,
        precheckStatus: "pending",
        failureCode: null,
        precheckFindings: [],
        checkedAt: null,
        expiresAt: null,
      };
      const nextLinks = oldLink ? submission.mediaLinks.map((item) => item.id === oldLink.id ? link : item) : [...submission.mediaLinks, link];
      const updated = { ...submission, mediaLinks: nextLinks, draftRevision: submission.draftRevision + 1, updatedAt: now };
      await repository.update(updated);
      await repository.saveIdempotency({ ownerUserId: user.id, key, fingerprint, submissionId, mediaLinkId: link.id, response: updated });
      await this.audit("submission.media_link_upsert", user, updated, context, { purpose }, transactionContext);
      return { submission: updated, link };
    });
  }

  async precheckMediaLink(user: User, submissionId: string, linkId: string, now = new Date(), context?: SubmissionRequestContext): Promise<{ submission: Submission; link: MediaLink }> {
    return this.repository.transaction(async (repository, transactionContext) => {
      const submission = await getOwned(repository, user, submissionId);
      requireEditable(submission);
      const current = submission.mediaLinks.find((link) => link.id === linkId);
      if (!current) throw new SubmissionError("MEDIA_LINK_NOT_FOUND", 404, "链接不存在");
      const result = inspectVideoLink(current.originalUrl, [...this.approvedVideoHosts]);
      const link: MediaLink = { ...current, canonicalUrl: result.canonicalUrl, provider: result.provider, precheckStatus: result.precheckStatus, failureCode: result.failureCode, precheckFindings: result.findings, checkedAt: now, expiresAt: new Date(now.getTime() + 30 * 60 * 1000) };
      const updated = { ...submission, mediaLinks: submission.mediaLinks.map((item) => item.id === link.id ? link : item), draftRevision: submission.draftRevision + 1, updatedAt: now };
      await repository.update(updated);
      await this.audit("submission.media_link_precheck", user, updated, context, { purpose: link.purpose, outcome: result.precheckStatus }, transactionContext);
      return { submission: updated, link };
    });
  }

  async adminList(user: User): Promise<Submission[]> {
    requireAdmin(user);
    return this.repository.listAll();
  }

  async adminGet(user: User, submissionId: string): Promise<Submission> {
    requireAdmin(user);
    const submission = await this.repository.findById(submissionId);
    if (!submission) throw new SubmissionError("SUBMISSION_NOT_FOUND", 404, "投稿不存在");
    return submission;
  }

  async adminTransition(user: User, submissionId: string, targetStatus: SubmissionStatus, reason: string, expectedStatus: SubmissionStatus, now = new Date(), context?: SubmissionRequestContext): Promise<Submission> {
    return this.repository.transaction(async (repository, transactionContext) => {
      requireAdmin(user);
      const submission = await repository.findById(submissionId);
      if (!submission) throw new SubmissionError("SUBMISSION_NOT_FOUND", 404, "投稿不存在");
      if (submission.currentStatus !== expectedStatus) throw new SubmissionError("STATUS_CONFLICT", 409, "投稿状态已变化，请刷新后重试");
      validateTransition(targetStatus, expectedStatus, reason);
      const updated: Submission = { ...submission, currentStatus: targetStatus, draftRevision: submission.draftRevision + 1, updatedAt: now };
      await repository.update(updated);
      await this.audit("admin.submission.transition", user, updated, context, { targetStatus, reason: reason.trim() }, transactionContext);
      return updated;
    });
  }

  async adminOpenMediaLink(user: User, submissionId: string, linkId: string, reason: string, now = new Date(), context?: SubmissionRequestContext): Promise<string> {
    return this.repository.transaction(async (repository, transactionContext) => {
      requireAdmin(user);
      if (reason.trim().length < 2 || reason.trim().length > 500) throw new SubmissionError("VALIDATION_ERROR", 422, "打开原因需为 2—500 个字符", [{ field: "reason", reason: "REASON_LENGTH" }]);
      const submission = await repository.findById(submissionId);
      if (!submission) throw new SubmissionError("SUBMISSION_NOT_FOUND", 404, "投稿不存在");
      const link = submission.mediaLinks.find((item) => item.id === linkId);
      if (!link) throw new SubmissionError("MEDIA_LINK_NOT_FOUND", 404, "链接不存在");
      if (link.precheckStatus !== "passed" || !link.canonicalUrl || !link.expiresAt || link.expiresAt <= now) throw new SubmissionError("LINK_NOT_VERIFIED", 409, "链接尚未通过有效预检，暂不能打开");
      await this.audit("admin.media_link.open", user, submission, context, { purpose: link.purpose, reason: reason.trim() }, transactionContext);
      return link.canonicalUrl;
    });
  }

  async submit(user: User, submissionId: string, ifMatch: string | undefined, now = new Date(), context?: SubmissionRequestContext): Promise<Submission> {
    return this.repository.transaction(async (repository, transactionContext) => {
      const submission = await getOwned(repository, user, submissionId);
      requireEditable(submission);
      assertRevision(submission.draftRevision, ifMatch);
      if (!submission.mediaLinks.some((link) => link.purpose === "mainWork")) throw new SubmissionError("SUBMISSION_INCOMPLETE", 422, "请先保存主体作品链接");
      if (!submission.draft.rightsConfirmed || !submission.draft.aiLabelConfirmed) throw new SubmissionError("SUBMISSION_INCOMPLETE", 422, "请完成版权与 AI 内容声明");
      const updated = { ...submission, currentStatus: "submitted" as const, draftRevision: submission.draftRevision + 1, updatedAt: now };
      await repository.update(updated);
      await this.audit("submission.submit", user, updated, context, undefined, transactionContext);
      return updated;
    });
  }

  private async audit(action: string, user: User, submission: Submission, context?: SubmissionRequestContext, metadata?: Record<string, string>, transactionContext?: SubmissionTransactionContext): Promise<void> {
    const writer = transactionContext?.audit ?? this.auditWriter;
    if (!writer || !context) return;
    const event: AuditEvent = { action, outcome: "success", requestId: context.requestId, userId: user.id, metadata: { submissionId: submission.id, ...metadata }, createdAt: new Date() };
    if (context.ip !== undefined) event.ip = context.ip;
    await writer(event);
  }

  private async nextReceiptNo(repository: SubmissionRepository): Promise<string> {
    for (;;) {
      const suffix = newOpaqueToken(5).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6).padEnd(6, "0");
      const candidate = `CVR26-${suffix}`;
      const existing = await repository.findByReceiptNo(candidate);
      if (!existing) return candidate;
    }
  }
}

export type SubmissionRequestContext = { requestId: string; ip?: string };

function requireAdmin(user: User): void {
  if (!user.emailVerifiedAt || (!user.roles.includes("event_admin") && !user.roles.includes("super_admin"))) {
    throw new SubmissionError("ADMIN_FORBIDDEN", 403, "当前账号没有投稿管理权限");
  }
  if (!user.mfaEnabled) throw new SubmissionError("MFA_REQUIRED", 403, "管理员账号必须启用多因素认证");
}

function validateTransition(targetStatus: SubmissionStatus, expectedStatus: SubmissionStatus, reason: string): void {
  if (!(SUBMISSION_STATUSES as readonly string[]).includes(targetStatus) || !(SUBMISSION_STATUSES as readonly string[]).includes(expectedStatus)) {
    throw new SubmissionError("VALIDATION_ERROR", 422, "投稿状态无效");
  }
  if (reason.trim().length < 2 || reason.trim().length > 1000) {
    throw new SubmissionError("VALIDATION_ERROR", 422, "处理原因需为 2—1,000 个字符", [{ field: "reason", reason: "REASON_LENGTH" }]);
  }
  const allowed: Record<SubmissionStatus, readonly SubmissionStatus[]> = {
    draft: [], checking_links: [], ready: [], submitted: ["qualification_pass", "needs_supplement", "invalid", "withdrawn"],
    needs_supplement: ["submitted", "invalid"], qualification_pass: ["reviewing", "invalid"], reviewing: ["shortlisted", "not_selected", "invalid"],
    shortlisted: ["winner", "not_selected"], winner: [], not_selected: [], withdrawn: [], invalid: [],
  };
  if (!allowed[expectedStatus].includes(targetStatus)) throw new SubmissionError("INVALID_TRANSITION", 409, "当前状态不允许执行该流转");
}

function requireParticipant(user: User): void {
  if (!user.emailVerifiedAt) throw new SubmissionError("EMAIL_VERIFICATION_REQUIRED", 403, "请先完成邮箱验证");
  if (!user.roles.includes("participant")) throw new SubmissionError("SUBMISSION_FORBIDDEN", 403, "当前账号没有参赛投稿权限");
}

function requireEditable(submission: Submission): void {
  if (submission.currentStatus !== "draft") throw new SubmissionError("SUBMISSION_NOT_EDITABLE", 409, "当前投稿状态不允许编辑");
}

function assertRevision(revision: number, ifMatch: string | undefined): void {
  if (!ifMatch) throw new SubmissionError("IF_MATCH_REQUIRED", 409, "保存前需要提供最新版本标记");
  const match = /^"(\d+)"$/.exec(ifMatch.trim());
  if (!match || Number(match[1]) !== revision) throw new SubmissionError("DRAFT_CONFLICT", 409, "投稿已在其他页面更新，请刷新后重试");
}

function normalizeIdempotencyKey(key: string): string {
  const normalized = key.trim();
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(normalized)) throw new SubmissionError("IDEMPOTENCY_KEY_INVALID", 422, "请提供有效的幂等键");
  return normalized;
}

function validateCreateInput(input: CreateDraftInput): void {
  if (typeof input.title !== "string" || input.title.trim().length < 2 || input.title.trim().length > 100) throw new SubmissionError("VALIDATION_ERROR", 422, "作品名称需为 2—100 个字符", [{ field: "title", reason: "TITLE_LENGTH" }]);
  if (!isDirection(input.direction)) throw new SubmissionError("VALIDATION_ERROR", 422, "投稿方向无效", [{ field: "direction", reason: "INVALID_ENUM" }]);
  if (!isWorkForm(input.workForm)) throw new SubmissionError("VALIDATION_ERROR", 422, "作品形式无效", [{ field: "workForm", reason: "INVALID_ENUM" }]);
}

function validateDraftPatch(patch: DraftPatch): void {
  if ((patch.aiWorkflow?.length ?? 0) > 3000 || (patch.humanContribution?.length ?? 0) > 3000) throw new SubmissionError("VALIDATION_ERROR", 422, "创作流程和人工贡献说明不能超过 3,000 个字符");
  if (patch.title !== undefined && (patch.title.trim().length < 2 || patch.title.trim().length > 100)) throw new SubmissionError("VALIDATION_ERROR", 422, "作品名称需为 2—100 个字符", [{ field: "title", reason: "TITLE_LENGTH" }]);
  if (patch.synopsis !== undefined && patch.synopsis.length > 2_000) throw new SubmissionError("VALIDATION_ERROR", 422, "作品简介不能超过 2,000 个字符", [{ field: "synopsis", reason: "SYNOPSIS_TOO_LONG" }]);
  if (patch.creativeStatement !== undefined && patch.creativeStatement.length > 3_000) throw new SubmissionError("VALIDATION_ERROR", 422, "创作说明不能超过 3,000 个字符", [{ field: "creativeStatement", reason: "STATEMENT_TOO_LONG" }]);
  if (patch.direction !== undefined && !isDirection(patch.direction)) throw new SubmissionError("VALIDATION_ERROR", 422, "投稿方向无效", [{ field: "direction", reason: "INVALID_ENUM" }]);
  if (patch.workForm !== undefined && !isWorkForm(patch.workForm)) throw new SubmissionError("VALIDATION_ERROR", 422, "作品形式无效", [{ field: "workForm", reason: "INVALID_ENUM" }]);
  if (patch.aiContributionPercent !== undefined && patch.aiContributionPercent !== null && (!Number.isInteger(patch.aiContributionPercent) || patch.aiContributionPercent < 80 || patch.aiContributionPercent > 100)) throw new SubmissionError("VALIDATION_ERROR", 422, "AI 占比需为 80—100 的整数", [{ field: "aiContributionPercent", reason: "PERCENT_OUT_OF_RANGE" }]);
  if (patch.aiTools !== undefined && (patch.aiTools.length > 30 || patch.aiTools.some((tool) => tool.trim().length > 100))) throw new SubmissionError("VALIDATION_ERROR", 422, "AI 工具清单格式无效", [{ field: "aiTools", reason: "TOOL_LIST_INVALID" }]);
}

function validateAndNormalizeVideoUrl(input: string, approvedHosts: Set<string>): string {
  if (typeof input !== "string" || input.length > 2_048) throw new SubmissionError("VALIDATION_ERROR", 422, "视频链接格式无效", [{ field: "url", reason: "URL_INVALID" }]);
  let url: URL;
  try { url = new URL(input.trim()); } catch { throw new SubmissionError("VALIDATION_ERROR", 422, "视频链接格式无效", [{ field: "url", reason: "URL_INVALID" }]); }
  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") || isIP(hostname.replace(/^\[|\]$/g, "")) !== 0 || hostname === "localhost" || hostname.endsWith(".local") || hostname.endsWith(".internal")) throw new SubmissionError("UNSAFE_URL", 422, "视频链接必须使用 HTTPS 且指向允许的平台", [{ field: "url", reason: "UNSAFE_URL" }]);
  if (!approvedHosts.has(hostname)) throw new SubmissionError("UNSUPPORTED_PLATFORM", 422, "该视频平台尚未纳入赛事白名单", [{ field: "url", reason: "UNSUPPORTED_PLATFORM" }]);
  return url.toString();
}

function isDirection(value: string): value is SubmissionDirection { return (SUBMISSION_DIRECTIONS as readonly string[]).includes(value); }
function isWorkForm(value: string): value is WorkForm { return (WORK_FORMS as readonly string[]).includes(value); }
function isMediaPurpose(value: string): value is MediaPurpose { return (MEDIA_PURPOSES as readonly string[]).includes(value); }

async function getOwned(repository: SubmissionRepository, user: User, submissionId: string): Promise<Submission> {
  requireParticipant(user);
  const submission = await repository.findById(submissionId);
  if (!submission || submission.ownerUserId !== user.id) throw new SubmissionError("SUBMISSION_NOT_FOUND", 404, "投稿不存在");
  return submission;
}
