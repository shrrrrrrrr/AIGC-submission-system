import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import type { PoolConfig } from "pg";
import { MfaService } from "./auth/mfa.js";
import { createDirectMailMailerFromEnv } from "./auth/directmail.js";
import { PostgresAuthRepository } from "./auth/postgres-repository.js";
import { InMemoryAuthRepository } from "./auth/repository.js";
import { AuthService, type Mailer } from "./auth/service.js";
import { PostgresSubmissionRepository } from "./submission/postgres-repository.js";
import { InMemorySubmissionRepository } from "./submission/repository.js";
import { SubmissionService } from "./submission/service.js";

export type RuntimeMode = "memory" | "postgres";

export type RuntimeDependencies = {
  mode: RuntimeMode;
  auth: AuthService;
  mfa: MfaService;
  submissions: SubmissionService;
  ready(): Promise<void>;
  close(): Promise<void>;
};

export type RuntimeFactoryOptions = {
  env?: NodeJS.ProcessEnv;
  poolFactory?: (config: PoolConfig) => Pool;
  productionMailer?: Mailer;
};

export function createRuntimeDependencies(options: RuntimeFactoryOptions = {}): RuntimeDependencies {
  const env = options.env ?? process.env;
  const mode = env.NODE_ENV?.trim().toLowerCase() === "production" ? "postgres" : "memory";
  const approvedVideoHosts = parseApprovedVideoHosts(env.APPROVED_VIDEO_PLATFORMS, mode === "postgres");
  const sessionTtlSeconds = parsePositiveInteger(env.SESSION_TTL_SECONDS, 28_800, "SESSION_TTL_SECONDS");

  if (mode === "memory") {
    const repository = new InMemoryAuthRepository();
    const submissionRepository = new InMemorySubmissionRepository();
    const mfa = new MfaService(repository, readMfaKey(env, false));
    const submissions = new SubmissionService(submissionRepository, approvedVideoHosts, (event) => repository.insertAuditEvent(event));
    const mailer = env.MAILER_MODE?.trim().toLowerCase() === "directmail" ? createDirectMailMailerFromEnv(env) : developmentMailer();
    return {
      mode,
      auth: new AuthService(repository, mailer, undefined, sessionTtlSeconds),
      mfa,
      submissions,
      ready: async () => undefined,
      close: async () => undefined,
    };
  }

  const databaseUrl = requireDatabaseUrl(env.DATABASE_URL);
  const mfaKey = readMfaKey(env, true);
  const mailer = requireProductionMailer(env, options.productionMailer);
  const pool = (options.poolFactory ?? ((config) => new Pool(config)))({
    connectionString: databaseUrl,
    max: parsePositiveInteger(env.PG_POOL_MAX, 10, "PG_POOL_MAX"),
    idleTimeoutMillis: parsePositiveInteger(env.PG_IDLE_TIMEOUT_MS, 30_000, "PG_IDLE_TIMEOUT_MS"),
    connectionTimeoutMillis: parsePositiveInteger(env.PG_CONNECTION_TIMEOUT_MS, 5_000, "PG_CONNECTION_TIMEOUT_MS"),
  });
  const repository = new PostgresAuthRepository(pool);
  const submissionRepository = new PostgresSubmissionRepository(pool);
  const mfa = new MfaService(repository, mfaKey);
  const submissions = new SubmissionService(submissionRepository, approvedVideoHosts, (event) => repository.insertAuditEvent(event));

  return {
    mode,
    auth: new AuthService(repository, mailer, undefined, sessionTtlSeconds),
    mfa,
    submissions,
    ready: async () => {
      await pool.query("SELECT 1");
    },
    close: async () => {
      await pool.end();
    },
  };
}

function developmentMailer(): Mailer {
  return {
    async sendEmailVerification(email: string, rawToken: string): Promise<void> {
      void rawToken;
      console.info(JSON.stringify({ event: "email_verification_stub", email }));
    },
    async sendPasswordReset(email: string, rawToken: string): Promise<void> {
      void rawToken;
      console.info(JSON.stringify({ event: "password_reset_stub", email }));
    },
  };
}

function requireProductionMailer(env: NodeJS.ProcessEnv, mailer: Mailer | undefined): Mailer {
  const mode = env.MAILER_MODE?.trim().toLowerCase();
  if (mailer) {
    if (mode !== "formal" && mode !== "directmail") throw new Error("MAILER_MODE 必须为 directmail 或 formal");
    return mailer;
  }
  if (mode !== "directmail") {
    throw new Error("生产环境必须配置 MAILER_MODE=directmail；开发邮件 stub 不得用于生产");
  }
  return createDirectMailMailerFromEnv(env);
}

function requireDatabaseUrl(value: string | undefined): string {
  const normalized = value?.trim();
  if (!normalized || !/^postgres(?:ql)?:\/\/[^\s]+$/i.test(normalized)) {
    throw new Error("生产环境必须配置有效的 DATABASE_URL（postgres:// 或 postgresql://）");
  }
  return normalized;
}

function readMfaKey(env: NodeJS.ProcessEnv, required: boolean): Buffer {
  const raw = env.MFA_ENCRYPTION_KEY?.trim();
  if (!raw) {
    if (required) throw new Error("生产环境必须配置 MFA_ENCRYPTION_KEY（32 字节 base64url）");
    return randomBytes(32);
  }
  if (!/^[A-Za-z0-9_-]+$/.test(raw)) throw new Error("MFA_ENCRYPTION_KEY 必须是无填充 base64url 字符串");
  const decoded = Buffer.from(raw, "base64url");
  if (decoded.length !== 32) throw new Error("MFA_ENCRYPTION_KEY 解码后必须正好为 32 字节");
  return decoded;
}

function parseApprovedVideoHosts(raw: string | undefined, required: boolean): string[] {
  const hosts = (raw ?? "").split(",").map((host) => host.trim().toLowerCase()).filter(Boolean);
  if (required && hosts.length === 0) throw new Error("生产环境必须配置 APPROVED_VIDEO_PLATFORMS");
  for (const host of hosts) {
    if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host)) {
      throw new Error("APPROVED_VIDEO_PLATFORMS 只能包含不带协议和路径的公网域名");
    }
  }
  return [...new Set(hosts)];
}

function parsePositiveInteger(raw: string | undefined, fallback: number, name: string): number {
  const value = raw === undefined || raw.trim() === "" ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} 必须是正整数`);
  return value;
}
