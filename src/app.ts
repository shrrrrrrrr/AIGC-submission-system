import { Hono } from "hono";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import { AuthError } from "./auth/errors.js";
import { newId } from "./auth/crypto.js";
import { AuthService } from "./auth/service.js";
import { MfaService } from "./auth/mfa.js";
import type { User } from "./auth/types.js";

const registerSchema = z.object({ email: z.string(), password: z.string() });
const loginSchema = registerSchema.extend({ mfaCode: z.string().length(6).optional() });
const resetRequestSchema = z.object({ email: z.string() });
const resetConfirmSchema = z.object({ token: z.string().min(1), newPassword: z.string() });
const SESSION_COOKIE = "__Host-chinavr-session";
const CSRF_COOKIE = "chinavr-csrf";

export type AppDependencies = {
  auth: AuthService;
  mfa?: MfaService;
  mfaVerifier?: (user: User, code: string) => Promise<boolean>;
};

export function createApp(dependencies: AppDependencies): Hono<RequestContext> {
  const app = new Hono<RequestContext>();

  app.use("/api/v1/*", async (c, next) => {
    c.set("requestId", c.req.header("x-request-id") || newId());
    await next();
  });

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

function errorBody(code: string, message: string, requestId: string) {
  return { code, message, requestId };
}

function csrfMatches(c: Context<RequestContext>, expected: string): boolean {
  return c.req.header("x-csrf-token") === getCookie(c, CSRF_COOKIE) && c.req.header("x-csrf-token") === expected;
}

function handleError(c: Context<RequestContext>, error: unknown, requestId: string) {
  if (error instanceof AuthError) return c.json(errorBody(error.code, error.message, requestId), error.status);
  return c.json(errorBody("INTERNAL_ERROR", "服务暂时不可用", requestId), 500);
}
