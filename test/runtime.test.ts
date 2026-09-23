import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import type { Pool } from "pg";
import { createRuntimeDependencies } from "../src/runtime.js";

const mfaKey = randomBytes(32).toString("base64url");
const mailer = {
  async sendEmailVerification(_email: string, _rawToken: string): Promise<void> {},
  async sendPasswordReset(_email: string, _rawToken: string): Promise<void> {},
};

{
  const runtime = createRuntimeDependencies({ env: { NODE_ENV: "development" } });
  assert.equal(runtime.mode, "memory");
  await runtime.ready();
  await runtime.close();
  console.log("PASS development runtime uses in-memory dependencies");
}

{
  assert.throws(
    () => createRuntimeDependencies({ env: { NODE_ENV: "production", MFA_ENCRYPTION_KEY: mfaKey, APPROVED_VIDEO_PLATFORMS: "example.com", MAILER_MODE: "formal" } }),
    /DATABASE_URL/,
  );
  console.log("PASS production runtime requires DATABASE_URL");
}

{
  assert.throws(
    () => createRuntimeDependencies({ env: { NODE_ENV: "production", DATABASE_URL: "postgresql://db.example.test/app", MFA_ENCRYPTION_KEY: "invalid", APPROVED_VIDEO_PLATFORMS: "example.com", MAILER_MODE: "formal" }, productionMailer: mailer }),
    /MFA_ENCRYPTION_KEY/,
  );
  console.log("PASS production runtime validates MFA key before pool creation");
}

{
  assert.throws(
    () => createRuntimeDependencies({ env: { NODE_ENV: "production", DATABASE_URL: "postgresql://db.example.test/app", MFA_ENCRYPTION_KEY: mfaKey, APPROVED_VIDEO_PLATFORMS: "example.com" } }),
    /MAILER_MODE=directmail/,
  );
  console.log("PASS production runtime rejects the development mailer stub");
}

{
  let readyChecks = 0;
  let closed = 0;
  let poolConfig: { connectionString?: string | undefined; max?: number | undefined; idleTimeoutMillis?: number | null | undefined; connectionTimeoutMillis?: number | undefined } | undefined;
  const pool = {
    async query(sql: string) {
      assert.equal(sql, "SELECT 1");
      readyChecks += 1;
      return { rows: [], rowCount: 0 };
    },
    async end() {
      closed += 1;
    },
  } as unknown as Pool;
  const runtime = createRuntimeDependencies({
    env: {
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://db.example.test/app",
      MFA_ENCRYPTION_KEY: mfaKey,
      APPROVED_VIDEO_PLATFORMS: "Example.com, video.example.org",
      MAILER_MODE: "formal",
      PG_POOL_MAX: "7",
      PG_IDLE_TIMEOUT_MS: "1200",
      PG_CONNECTION_TIMEOUT_MS: "800",
    },
    productionMailer: mailer,
    poolFactory: (config) => {
      poolConfig = config;
      return pool;
    },
  });
  assert.equal(runtime.mode, "postgres");
  assert.deepEqual(poolConfig, { connectionString: "postgresql://db.example.test/app", max: 7, idleTimeoutMillis: 1200, connectionTimeoutMillis: 800 });
  await runtime.ready();
  await runtime.close();
  assert.equal(readyChecks, 1);
  assert.equal(closed, 1);
  console.log("PASS production runtime wires PostgreSQL pool and lifecycle");
}

{
  let closed = 0;
  const pool = {
    async query() {
      return { rows: [], rowCount: 0 };
    },
    async end() {
      closed += 1;
    },
  } as unknown as Pool;
  const runtime = createRuntimeDependencies({
    env: {
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://db.example.test/app",
      MFA_ENCRYPTION_KEY: mfaKey,
      APPROVED_VIDEO_PLATFORMS: "example.com",
      MAILER_MODE: "directmail",
      MAILER_ACCESS_KEY_ID: "test-id",
      MAILER_ACCESS_KEY_SECRET: "test-secret",
      MAILER_FROM_ADDRESS: "noreply@example.test",
      APP_PUBLIC_URL: "https://submit.example.test",
    },
    poolFactory: () => pool,
  });
  assert.equal(runtime.mode, "postgres");
  await runtime.close();
  assert.equal(closed, 1);
  console.log("PASS production runtime constructs DirectMail from isolated environment configuration");
}
