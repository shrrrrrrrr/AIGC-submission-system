import { Hono } from "hono";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import { bodyLimit } from "hono/body-limit";
import { AuthError } from "./auth/errors.js";
import { newId } from "./auth/crypto.js";
import { AuthService } from "./auth/service.js";
import { MfaService } from "./auth/mfa.js";
import type { User } from "./auth/types.js";
import { SubmissionError } from "./submission/errors.js";
import { SubmissionService } from "./submission/service.js";
import type { SubmissionRequestContext } from "./submission/service.js";
import { MEDIA_PURPOSES, SUBMISSION_DIRECTIONS, SUBMISSION_STATUSES, WORK_FORMS } from "./submission/types.js";

const registerSchema = z.object({ email: z.string(), password: z.string() });
const loginSchema = registerSchema.extend({ mfaCode: z.string().length(6).optional() });
const resetRequestSchema = z.object({ email: z.string() });
const resetConfirmSchema = z.object({ token: z.string().min(1), newPassword: z.string() });
const createSubmissionSchema = z.object({ title: z.string().trim().min(2).max(100), direction: z.enum(SUBMISSION_DIRECTIONS), workForm: z.enum(WORK_FORMS) }).strict();
const patchSubmissionSchema = z.object({
  title: z.string().optional(),
  direction: z.enum(SUBMISSION_DIRECTIONS).optional(),
  workForm: z.enum(WORK_FORMS).optional(),
  synopsis: z.string().optional(),
  creativeStatement: z.string().optional(),
  aiContributionPercent: z.number().int().min(80).max(100).nullable().optional(),
  aiTools: z.array(z.string()).max(30).optional(),
  aiWorkflow: z.string().max(3000).optional(),
  humanContribution: z.string().max(3000).optional(),
  rightsConfirmed: z.boolean().optional(),
  aiLabelConfirmed: z.boolean().optional(),
  templateConfirmed: z.boolean().nullable().optional(),
}).strict();
const mediaLinkSchema = z.object({ purpose: z.enum(MEDIA_PURPOSES), url: z.string().max(2048) }).strict();
const adminListSchema = z.object({ limit: z.coerce.number().int().min(1).max(50).default(50), status: z.enum(SUBMISSION_STATUSES).optional() });
const adminTransitionSchema = z.object({ targetStatus: z.enum(SUBMISSION_STATUSES), expectedStatus: z.enum(SUBMISSION_STATUSES), reason: z.string().trim().min(2).max(1000) }).strict();
const SESSION_COOKIE = "__Host-chinavr-session";
const CSRF_COOKIE = "chinavr-csrf";

export type AppDependencies = {
  auth: AuthService;
  mfa?: MfaService;
  mfaVerifier?: (user: User, code: string) => Promise<boolean>;
  submissions?: SubmissionService;
};

export function createApp(dependencies: AppDependencies): Hono<RequestContext> {
  const app = new Hono<RequestContext>();

  app.use("/api/v1/*", async (c, next) => {
    c.set("requestId", c.req.header("x-request-id") || newId());
    c.header("Cache-Control", "no-store");
    await next();
  });
  app.use("/api/v1/submissions*", bodyLimit({ maxSize: 64 * 1024, onError: (c) => c.json(errorBody("BODY_TOO_LARGE", "请求内容过大", c.get("requestId")), 413) }));
  app.use("/api/v1/admin/submissions*", bodyLimit({ maxSize: 16 * 1024, onError: (c) => c.json(errorBody("BODY_TOO_LARGE", "请求内容过大", c.get("requestId")), 413) }));

  app.post("/api/v1/auth/register", async (c) => {
    const requestId = c.get("requestId");
    const body = registerSchema.safeParse(await safeJson(c));
    if (!body.success) return c.json(errorBody("INVALID_REQUEST", "请求参数不完整", requestId), 422);

    try {
      await dependencies.auth.register(body.data.email, body.data.password, requestId, c.req.header("x-forwarded-for"));
      return c.json({ message: "如果邮箱可用，我们会发送验证邮件", requestId }, 202);
    } catch (error) {
      return handleError(c, error, requestId);
    }
  });

  app.get("/api/v1/auth/verify-email", async (c) => {
    const requestId = c.get("requestId");
    const token = c.req.query("token");
    if (!token) return c.json(errorBody("INVALID_VERIFICATION_TOKEN", "验证链接无效或已过期", requestId), 400);
    try {
      await dependencies.auth.verifyEmail(token, requestId, c.req.header("x-forwarded-for"));
      return c.json({ message: "邮箱验证成功，请登录", requestId });
    } catch (error) {
      return handleError(c, error, requestId);
    }
  });

  app.post("/api/v1/auth/login", async (c) => {
    const requestId = c.get("requestId");
    const body = loginSchema.safeParse(await safeJson(c));
    if (!body.success) return c.json(errorBody("INVALID_REQUEST", "请求参数不完整", requestId), 422);
    const clientKey = c.req.header("x-forwarded-for") || "unknown";
    const limiter = loginLimiters.get(clientKey) ?? createLimiter();
    loginLimiters.set(clientKey, limiter);

    try {
      const result = await dependencies.auth.login(
        body.data.email,
        body.data.password,
        requestId,
        clientKey,
        () => limiter.allow(),
        () => limiter.reset(),
        body.data.mfaCode,
        dependencies.mfaVerifier ?? (dependencies.mfa ? (user, code) => dependencies.mfa!.verifyLogin(user, code) : undefined),
      );
      setCookie(c, SESSION_COOKIE, result.rawSessionToken, { httpOnly: true, secure: true, sameSite: "Lax", path: "/", maxAge: 28_800 });
      setCookie(c, CSRF_COOKIE, result.csrfToken, { httpOnly: false, secure: true, sameSite: "Lax", path: "/", maxAge: 28_800 });
      return c.json({ user: publicUser(result.user), expiresAt: result.expiresAt.toISOString(), requestId });
    } catch (error) {
      return handleError(c, error, requestId);
    }
  });

  app.post("/api/v1/auth/mfa/enroll", async (c) => {
    const requestId = c.get("requestId");
    const sessionResult = await dependencies.auth.getSession(getCookie(c, SESSION_COOKIE));
    if (!sessionResult) return c.json(errorBody("UNAUTHENTICATED", "请先登录", requestId), 401);
    if (!csrfMatches(c, sessionResult.session.csrfToken)) return c.json(errorBody("CSRF_INVALID", "请求校验失败", requestId), 403);
    if (!dependencies.mfa) return c.json(errorBody("MFA_UNAVAILABLE", "多因素认证暂不可用", requestId), 503);
    try {
      const result = await dependencies.mfa.beginEnrollment(sessionResult.user);
      return c.json({ ...result, requestId });
    } catch (error) {
      return handleError(c, error, requestId);
    }
  });

  app.post("/api/v1/auth/mfa/confirm", async (c) => {
    const requestId = c.get("requestId");
    const sessionResult = await dependencies.auth.getSession(getCookie(c, SESSION_COOKIE));
    if (!sessionResult) return c.json(errorBody("UNAUTHENTICATED", "请先登录", requestId), 401);
    if (!csrfMatches(c, sessionResult.session.csrfToken)) return c.json(errorBody("CSRF_INVALID", "请求校验失败", requestId), 403);
    if (!dependencies.mfa) return c.json(errorBody("MFA_UNAVAILABLE", "多因素认证暂不可用", requestId), 503);
    const body = z.object({ code: z.string().length(6) }).safeParse(await safeJson(c));
    if (!body.success) return c.json(errorBody("INVALID_REQUEST", "请输入 6 位验证码", requestId), 422);
    try {
      await dependencies.mfa.confirmEnrollment(sessionResult.user, body.data.code);
      return c.json({ message: "多因素认证已启用", requestId });
    } catch (error) {
      return handleError(c, error, requestId);
    }
  });

  app.post("/api/v1/auth/password-reset/request", async (c) => {
    const requestId = c.get("requestId");
    const body = resetRequestSchema.safeParse(await safeJson(c));
    if (!body.success) return c.json(errorBody("INVALID_REQUEST", "请求参数不完整", requestId), 422);
    try {
      await dependencies.auth.requestPasswordReset(body.data.email, requestId, c.req.header("x-forwarded-for"));
      return c.json({ message: "如果邮箱对应账号，我们会发送重置邮件", requestId }, 202);
    } catch (error) {
      return handleError(c, error, requestId);
    }
  });

  app.post("/api/v1/auth/password-reset/confirm", async (c) => {
    const requestId = c.get("requestId");
    const body = resetConfirmSchema.safeParse(await safeJson(c));
    if (!body.success) return c.json(errorBody("INVALID_REQUEST", "请求参数不完整", requestId), 422);
    try {
      await dependencies.auth.confirmPasswordReset(body.data.token, body.data.newPassword, requestId, c.req.header("x-forwarded-for"));
      return c.body(null, 204);
    } catch (error) {
      return handleError(c, error, requestId);
    }
  });

  app.post("/api/v1/auth/logout", async (c) => {
    const requestId = c.get("requestId");
    const sessionResult = await dependencies.auth.getSession(getCookie(c, SESSION_COOKIE));
    if (!sessionResult) return c.json(errorBody("UNAUTHENTICATED", "请先登录", requestId), 401);
    if (!csrfMatches(c, sessionResult.session.csrfToken)) {
      return c.json(errorBody("CSRF_INVALID", "请求校验失败", requestId), 403);
    }
    await dependencies.auth.logout(sessionResult.session, requestId, c.req.header("x-forwarded-for"));
    deleteCookie(c, SESSION_COOKIE, { path: "/", secure: true });
    deleteCookie(c, CSRF_COOKIE, { path: "/" });
    return c.body(null, 204);
  });

  app.get("/api/v1/me", async (c) => {
    const requestId = c.get("requestId");
    const sessionResult = await dependencies.auth.getSession(getCookie(c, SESSION_COOKIE));
    if (!sessionResult) return c.json(errorBody("UNAUTHENTICATED", "请先登录", requestId), 401);
    return c.json({ user: publicUser(sessionResult.user), requestId });
  });

  app.get("/api/v1/admin/submissions", async (c) => {
    const requestId = c.get("requestId");
    const sessionResult = await dependencies.auth.getSession(getCookie(c, SESSION_COOKIE));
    if (!sessionResult) return c.json(errorBody("UNAUTHENTICATED", "请先登录", requestId), 401);
    if (!dependencies.submissions) return c.json(errorBody("SUBMISSIONS_UNAVAILABLE", "投稿服务暂不可用", requestId), 503);
    const query = adminListSchema.safeParse(c.req.query());
    if (!query.success) return c.json(errorBody("INVALID_REQUEST", "分页或状态参数无效", requestId), 422);
    try {
      const submissions = (await dependencies.submissions.adminList(sessionResult.user)).filter((item) => !query.data.status || item.currentStatus === query.data.status).slice(0, query.data.limit);
      return c.json({ items: submissions.map(adminSubmissionSummary), requestId });
    } catch (error) {
      return handleError(c, error, requestId);
    }
  });

  app.get("/api/v1/admin/submissions/:id", async (c) => {
    const requestId = c.get("requestId");
    const sessionResult = await dependencies.auth.getSession(getCookie(c, SESSION_COOKIE));
    if (!sessionResult) return c.json(errorBody("UNAUTHENTICATED", "请先登录", requestId), 401);
    if (!dependencies.submissions) return c.json(errorBody("SUBMISSIONS_UNAVAILABLE", "投稿服务暂不可用", requestId), 503);
    try {
      const submission = await dependencies.submissions.adminGet(sessionResult.user, c.req.param("id"));
      return c.json({ submission: adminSafeSubmission(submission), requestId });
    } catch (error) {
      return handleError(c, error, requestId);
    }
  });

  app.post("/api/v1/admin/submissions/:id/transitions", async (c) => {
    const requestId = c.get("requestId");
    const sessionResult = await dependencies.auth.getSession(getCookie(c, SESSION_COOKIE));
    if (!sessionResult) return c.json(errorBody("UNAUTHENTICATED", "请先登录", requestId), 401);
    if (!csrfMatches(c, sessionResult.session.csrfToken)) return c.json(errorBody("CSRF_INVALID", "请求校验失败", requestId), 403);
    if (!dependencies.submissions) return c.json(errorBody("SUBMISSIONS_UNAVAILABLE", "投稿服务暂不可用", requestId), 503);
    const body = adminTransitionSchema.safeParse(await safeJson(c));
    if (!body.success) return c.json(errorBody("VALIDATION_ERROR", "状态流转参数无效", requestId), 422);
    try {
      const submission = await dependencies.submissions.adminTransition(sessionResult.user, c.req.param("id"), body.data.targetStatus, body.data.reason, body.data.expectedStatus, new Date(), submissionContext(c, requestId));
      return c.json({ submission: adminSafeSubmission(submission), requestId });
    } catch (error) {
      return handleError(c, error, requestId);
    }
  });

  app.post("/api/v1/submissions", async (c) => {
    const requestId = c.get("requestId");
    const sessionResult = await dependencies.auth.getSession(getCookie(c, SESSION_COOKIE));
    if (!sessionResult) return c.json(errorBody("UNAUTHENTICATED", "请先登录", requestId), 401);
    if (!csrfMatches(c, sessionResult.session.csrfToken)) return c.json(errorBody("CSRF_INVALID", "请求校验失败", requestId), 403);
    if (!dependencies.submissions) return c.json(errorBody("SUBMISSIONS_UNAVAILABLE", "投稿服务暂不可用", requestId), 503);
    const body = createSubmissionSchema.safeParse(await safeJson(c));
    if (!body.success) return c.json(errorBody("VALIDATION_ERROR", "投稿基础信息不完整", requestId), 422);
    const idempotencyKey = c.req.header("idempotency-key");
    if (!idempotencyKey) return c.json(errorBody("IDEMPOTENCY_KEY_REQUIRED", "请重试并携带幂等键", requestId), 422);
    try {
      const submission = await dependencies.submissions.createDraft(sessionResult.user, body.data, idempotencyKey, new Date(), submissionContext(c, requestId));
      c.header("ETag", draftEtag(submission.draftRevision));
      return c.json({ submission: publicSubmission(submission), requestId }, 201);
    } catch (error) {
      return handleError(c, error, requestId);
    }
  });

  app.get("/api/v1/submissions", async (c) => {
    const requestId = c.get("requestId");
    const sessionResult = await dependencies.auth.getSession(getCookie(c, SESSION_COOKIE));
    if (!sessionResult) return c.json(errorBody("UNAUTHENTICATED", "请先登录", requestId), 401);
    if (!dependencies.submissions) return c.json(errorBody("SUBMISSIONS_UNAVAILABLE", "投稿服务暂不可用", requestId), 503);
    try {
      const query = z.object({ limit: z.coerce.number().int().min(1).max(50).default(20), cursor: z.string().uuid().optional(), status: z.literal("draft").optional() }).safeParse(c.req.query());
      if (!query.success) return c.json(errorBody("INVALID_REQUEST", "分页或状态参数无效", requestId), 422);
      const items = (await dependencies.submissions.list(sessionResult.user)).filter((item) => !query.data.status || item.currentStatus === query.data.status);
      const cursorIndex = query.data.cursor ? items.findIndex((item) => item.id === query.data.cursor) : -1;
      if (query.data.cursor && cursorIndex < 0) return c.json(errorBody("INVALID_CURSOR", "分页位置已失效，请从首页重新加载", requestId), 422);
      const page = items.slice(cursorIndex + 1, cursorIndex + 1 + query.data.limit);
      const nextCursor = cursorIndex + 1 + page.length < items.length ? page.at(-1)!.id : null;
      return c.json({ items: page.map((item) => ({ id: item.id, receiptNo: item.receiptNo, title: item.draft.title, currentStatus: item.currentStatus, updatedAt: item.updatedAt.toISOString() })), nextCursor, requestId });
    } catch (error) {
      return handleError(c, error, requestId);
    }
  });

  app.get("/api/v1/submissions/:id", async (c) => {
    const requestId = c.get("requestId");
    const sessionResult = await dependencies.auth.getSession(getCookie(c, SESSION_COOKIE));
    if (!sessionResult) return c.json(errorBody("UNAUTHENTICATED", "请先登录", requestId), 401);
    if (!dependencies.submissions) return c.json(errorBody("SUBMISSIONS_UNAVAILABLE", "投稿服务暂不可用", requestId), 503);
    try {
      const submission = await dependencies.submissions.get(sessionResult.user, c.req.param("id"));
      c.header("ETag", draftEtag(submission.draftRevision));
      return c.json({ submission: publicSubmission(submission), requestId });
    } catch (error) {
      return handleError(c, error, requestId);
    }
  });

  app.patch("/api/v1/submissions/:id/draft", async (c) => {
    const requestId = c.get("requestId");
    const sessionResult = await dependencies.auth.getSession(getCookie(c, SESSION_COOKIE));
    if (!sessionResult) return c.json(errorBody("UNAUTHENTICATED", "请先登录", requestId), 401);
    if (!csrfMatches(c, sessionResult.session.csrfToken)) return c.json(errorBody("CSRF_INVALID", "请求校验失败", requestId), 403);
    if (!dependencies.submissions) return c.json(errorBody("SUBMISSIONS_UNAVAILABLE", "投稿服务暂不可用", requestId), 503);
    const body = patchSubmissionSchema.safeParse(await safeJson(c));
    if (!body.success) return c.json(errorBody("VALIDATION_ERROR", "投稿内容格式无效", requestId), 422);
    try {
      const submission = await dependencies.submissions.patchDraft(sessionResult.user, c.req.param("id"), body.data, c.req.header("if-match"), new Date(), submissionContext(c, requestId));
      c.header("ETag", draftEtag(submission.draftRevision));
      return c.json({ submission: publicSubmission(submission), requestId });
    } catch (error) {
      return handleError(c, error, requestId);
    }
  });

  app.post("/api/v1/submissions/:id/media-links", async (c) => {
    const requestId = c.get("requestId");
    const sessionResult = await dependencies.auth.getSession(getCookie(c, SESSION_COOKIE));
    if (!sessionResult) return c.json(errorBody("UNAUTHENTICATED", "请先登录", requestId), 401);
    if (!csrfMatches(c, sessionResult.session.csrfToken)) return c.json(errorBody("CSRF_INVALID", "请求校验失败", requestId), 403);
    if (!dependencies.submissions) return c.json(errorBody("SUBMISSIONS_UNAVAILABLE", "投稿服务暂不可用", requestId), 503);
    const body = mediaLinkSchema.safeParse(await safeJson(c));
    if (!body.success) return c.json(errorBody("VALIDATION_ERROR", "链接用途或地址无效", requestId), 422);
    const idempotencyKey = c.req.header("idempotency-key");
    if (!idempotencyKey) return c.json(errorBody("IDEMPOTENCY_KEY_REQUIRED", "请重试并携带幂等键", requestId), 422);
    try {
      const result = await dependencies.submissions.upsertMediaLink(sessionResult.user, c.req.param("id"), body.data.purpose, body.data.url, c.req.header("if-match"), idempotencyKey, new Date(), submissionContext(c, requestId));
      c.header("ETag", draftEtag(result.submission.draftRevision));
      return c.json({ submission: publicSubmission(result.submission), link: publicMediaLink(result.link), requestId }, 201);
    } catch (error) {
      return handleError(c, error, requestId);
    }
  });

  app.post("/api/v1/submissions/:id/media-links/:linkId/prechecks", async (c) => {
    const requestId = c.get("requestId");
    const sessionResult = await dependencies.auth.getSession(getCookie(c, SESSION_COOKIE));
    if (!sessionResult) return c.json(errorBody("UNAUTHENTICATED", "请先登录", requestId), 401);
    if (!csrfMatches(c, sessionResult.session.csrfToken)) return c.json(errorBody("CSRF_INVALID", "请求校验失败", requestId), 403);
    if (!dependencies.submissions) return c.json(errorBody("SUBMISSIONS_UNAVAILABLE", "投稿服务暂不可用", requestId), 503);
    try {
      const result = await dependencies.submissions.precheckMediaLink(sessionResult.user, c.req.param("id"), c.req.param("linkId"), new Date(), submissionContext(c, requestId));
      return c.json({ submission: publicSubmission(result.submission), precheck: publicMediaLink(result.link), requestId }, 202);
    } catch (error) {
      return handleError(c, error, requestId);
    }
  });

  app.post("/api/v1/submissions/:id/submit", async (c) => {
    const requestId = c.get("requestId");
    const sessionResult = await dependencies.auth.getSession(getCookie(c, SESSION_COOKIE));
    if (!sessionResult) return c.json(errorBody("UNAUTHENTICATED", "请先登录", requestId), 401);
    if (!csrfMatches(c, sessionResult.session.csrfToken)) return c.json(errorBody("CSRF_INVALID", "请求校验失败", requestId), 403);
    if (!dependencies.submissions) return c.json(errorBody("SUBMISSIONS_UNAVAILABLE", "投稿服务暂不可用", requestId), 503);
    try {
      const submission = await dependencies.submissions.submit(sessionResult.user, c.req.param("id"), c.req.header("if-match"), new Date(), submissionContext(c, requestId));
      c.header("ETag", draftEtag(submission.draftRevision));
      return c.json({ submission: publicSubmission(submission), requestId });
    } catch (error) {
      return handleError(c, error, requestId);
    }
  });

  app.notFound((c) => c.json(errorBody("NOT_FOUND", "资源不存在", c.get("requestId") || newId()), 404));
  app.onError((error, c) => handleError(c, error, c.get("requestId") || newId()));
  return app;
}

type RequestContext = { Variables: { requestId: string } };

const loginLimiters = new Map<string, LoginLimiter>();

function createLimiter(): LoginLimiter {
  let failures = 0;
  let windowStartedAt = Date.now();
  return {
    allow() {
      if (Date.now() - windowStartedAt >= 15 * 60 * 1000) {
        failures = 0;
        windowStartedAt = Date.now();
      }
      if (failures >= 5) return false;
      failures += 1;
      return true;
    },
    reset() {
      failures = 0;
    },
  };
}

type LoginLimiter = { allow(): boolean; reset(): void };

async function safeJson(c: { req: { json(): Promise<unknown> } }): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

function publicUser(user: User) {
  return { id: user.id, email: user.email, roles: user.roles, emailVerified: user.emailVerifiedAt !== null, mfaEnabled: user.mfaEnabled };
}

function errorBody(code: string, message: string, requestId: string, details?: Array<{ field: string; reason: string }>) {
  return details ? { code, message, details, requestId } : { code, message, requestId };
}

function csrfMatches(c: Context<RequestContext>, expected: string): boolean {
  return c.req.header("x-csrf-token") === getCookie(c, CSRF_COOKIE) && c.req.header("x-csrf-token") === expected;
}

function submissionContext(c: Context<RequestContext>, requestId: string): SubmissionRequestContext {
  const ip = c.req.header("x-forwarded-for");
  return ip === undefined ? { requestId } : { requestId, ip };
}

function handleError(c: Context<RequestContext>, error: unknown, requestId: string) {
  if (error instanceof AuthError) return c.json(errorBody(error.code, error.message, requestId), error.status);
  if (error instanceof SubmissionError) return c.json(errorBody(error.code, error.message, requestId, error.details), error.status);
  return c.json(errorBody("INTERNAL_ERROR", "服务暂时不可用", requestId), 500);
}

function draftEtag(revision: number): string {
  return `"${revision}"`;
}

function publicSubmission(submission: import("./submission/types.js").Submission) {
  return { ...submission, createdAt: submission.createdAt.toISOString(), updatedAt: submission.updatedAt.toISOString(), mediaLinks: submission.mediaLinks.map(publicMediaLink) };
}

function publicMediaLink(link: import("./submission/types.js").MediaLink) {
  return { ...link, checkedAt: link.checkedAt?.toISOString() ?? null, expiresAt: link.expiresAt?.toISOString() ?? null };
}

function adminSubmissionSummary(submission: import("./submission/types.js").Submission) {
  return { id: submission.id, receiptNo: submission.receiptNo, title: submission.draft.title, direction: submission.draft.direction, workForm: submission.draft.workForm, currentStatus: submission.currentStatus, currentVersionNo: submission.currentVersionNo, updatedAt: submission.updatedAt.toISOString() };
}

function adminSafeSubmission(submission: import("./submission/types.js").Submission) {
  return { ...publicSubmission(submission), mediaLinks: submission.mediaLinks.map((link) => {
    const { originalUrl: _originalUrl, canonicalUrl: _canonicalUrl, ...safe } = publicMediaLink(link);
    return safe;
  }) };
}
