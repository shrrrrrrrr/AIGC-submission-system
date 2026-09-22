import assert from "node:assert/strict";
import type { Pool, PoolClient, QueryResult } from "pg";
import { PostgresSubmissionRepository } from "../src/submission/postgres-repository.js";
import { SubmissionService } from "../src/submission/service.js";
import type { User } from "../src/auth/types.js";

const user: User = {
  id: "00000000-0000-4000-8000-000000000031",
  email: "pg@example.com",
  passwordHash: "unused",
  emailVerifiedAt: new Date("2026-09-23T00:00:00.000Z"),
  roles: ["participant"],
  mfaEnabled: false,
  mfaSecretCiphertext: null,
  mfaPendingSecretCiphertext: null,
  mfaLastUsedCounter: null,
  createdAt: new Date("2026-09-23T00:00:00.000Z"),
};

class FakeClient {
  readonly statements: string[] = [];
  async query<T extends object = object>(query: string, _values?: unknown[]): Promise<QueryResult<T>> {
    this.statements.push(query.replace(/\s+/g, " ").trim());
    if (/RETURNING id/.test(query) && /submission_versions/.test(query)) return { rows: [{ id: "00000000-0000-4000-8000-000000000032" } as T], rowCount: 1 } as unknown as QueryResult<T>;
    if (/pg_advisory_xact_lock/.test(query) || /submission_idempotency_keys/.test(query) && query.startsWith("SELECT")) return { rows: [], rowCount: 0 } as unknown as QueryResult<T>;
    return { rows: [], rowCount: 1 } as unknown as QueryResult<T>;
  }
  release(): void {}
}

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  await fn();
  console.log(`PASS ${name}`);
}

void test("PostgreSQL submission repository runs create draft in one client transaction", async () => {
  const client = new FakeClient();
  const pool = { connect: async () => client } as unknown as Pool;
  const repository = new PostgresSubmissionRepository(pool);
  const service = new SubmissionService(repository);
  const submission = await service.createDraft(user, { title: "PG 草稿", direction: "frontier_tech", workForm: "animation" }, "pg-create-02");
  assert.equal(submission.currentStatus, "draft");
  assert.equal(client.statements[0], "BEGIN");
  assert.equal(client.statements.at(-1), "COMMIT");
  assert.equal(client.statements.some((statement) => statement.includes("INSERT INTO submissions")), true);
  assert.equal(client.statements.some((statement) => statement.includes("INSERT INTO submission_versions")), true);
  assert.equal(client.statements.some((statement) => statement.includes("INSERT INTO submission_idempotency_keys")), true);
});

void test("PostgreSQL submission audit is written on the same transaction client", async () => {
  const client = new FakeClient();
  const pool = { connect: async () => client } as unknown as Pool;
  const repository = new PostgresSubmissionRepository(pool);
  const service = new SubmissionService(repository, [], async () => {
    throw new Error("fallback audit writer must not be used inside a PostgreSQL transaction");
  });
  await service.createDraft(user, { title: "PG 审计", direction: "frontier_tech", workForm: "animation" }, "pg-audit-02", new Date(), { requestId: "request-pg-audit" });
  const auditIndex = client.statements.findIndex((statement) => statement.includes("INSERT INTO audit_logs"));
  assert.ok(auditIndex > 0);
  assert.equal(client.statements.at(-1), "COMMIT");
});
