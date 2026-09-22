import assert from "node:assert/strict";
import { PostgresAuthRepository } from "../src/auth/postgres-repository.js";

type QueryCall = { sql: string; params?: unknown[] };

function makePool(failUserUpdate = false) {
  const calls: QueryCall[] = [];
  const client = {
    async query(sql: string, params?: unknown[]) {
      if (params === undefined) calls.push({ sql });
      else calls.push({ sql, params });
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { rows: [], rowCount: 0 };
      if (sql.includes("password_reset_tokens SET consumed_at")) return { rows: [{ userId: "user-1" }], rowCount: 1 };
      if (sql.includes("UPDATE users SET password_hash") && failUserUpdate) throw new Error("simulated update failure");
      if (sql.includes("UPDATE users SET password_hash")) return { rows: [], rowCount: 1 };
      if (sql.includes("UPDATE sessions SET revoked_at")) return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
    release() {
      calls.push({ sql: "RELEASE" });
    },
  };
  return {
    calls,
    pool: {
      async connect() {
        return client;
      },
    },
  };
}

{
  const fixture = makePool();
  const repository = new PostgresAuthRepository(fixture.pool as never);
  const userId = await repository.consumePasswordResetAndUpdatePassword("hash", new Date("2026-09-22T00:00:00Z"), "argon2-hash");
  assert.equal(userId, "user-1");
  assert.deepEqual(fixture.calls.map((call) => call.sql), [
    "BEGIN",
    "UPDATE password_reset_tokens SET consumed_at = $2 WHERE token_hash = $1 AND consumed_at IS NULL AND expires_at > $2 RETURNING user_id AS \"userId\"",
    "UPDATE users SET password_hash = $2 WHERE id = $1",
    "UPDATE sessions SET revoked_at = $2 WHERE user_id = $1 AND revoked_at IS NULL",
    "COMMIT",
    "RELEASE",
  ]);
  console.log("PASS PostgreSQL password reset uses one transaction");
}

{
  const fixture = makePool(true);
  const repository = new PostgresAuthRepository(fixture.pool as never);
  await assert.rejects(() => repository.consumePasswordResetAndUpdatePassword("hash", new Date(), "argon2-hash"), /simulated update failure/);
  assert.equal(fixture.calls.at(-2)?.sql, "ROLLBACK");
  assert.equal(fixture.calls.at(-1)?.sql, "RELEASE");
  console.log("PASS PostgreSQL password reset rolls back on failure");
}
