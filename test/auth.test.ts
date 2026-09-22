import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { InMemoryAuthRepository } from "../src/auth/repository.js";
import { AuthService } from "../src/auth/service.js";

const cases: Array<[string, () => Promise<void>]> = [];
function test(name: string, fn: () => Promise<void>): void {
  cases.push([name, fn]);
}

function setup() {
  const repository = new InMemoryAuthRepository();
  const sent: Array<{ email: string; token: string }> = [];
  const auth = new AuthService(repository, {
    async sendEmailVerification(email, token) {
      sent.push({ email, token });
    },
  });
  return { app: createApp({ auth }), repository, sent };
}

test("register does not reveal whether an email already exists", async () => {
  const first = setup();
  const response = await first.app.request("http://localhost/api/v1/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "USER@example.com", password: "a long safe 密码 123" }),
  });
  assert.equal(response.status, 202);
  assert.equal(first.sent.length, 1);

  const duplicate = await first.app.request("http://localhost/api/v1/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "user@example.com", password: "a long safe 密码 123" }),
  });
  assert.equal(duplicate.status, 202);
  const duplicateBody = (await duplicate.json()) as { message: string };
  const firstBody = (await response.json()) as { message: string };
  assert.equal(duplicateBody.message, firstBody.message);
  assert.equal(first.sent.length, 1);
});

test("verification token is one-time and login sets secure session cookies", async () => {
  const { app, sent, repository } = setup();
  await app.request("http://localhost/api/v1/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "verified@example.com", password: "a long safe 密码 123" }),
  });
  const verify = await app.request(`http://localhost/api/v1/auth/verify-email?token=${sent[0]!.token}`);
  assert.equal(verify.status, 200);
  const replay = await app.request(`http://localhost/api/v1/auth/verify-email?token=${sent[0]!.token}`);
  assert.equal(replay.status, 400);

  const login = await app.request("http://localhost/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.10" },
    body: JSON.stringify({ email: "verified@example.com", password: "a long safe 密码 123" }),
  });
  assert.equal(login.status, 200);
  const cookies = login.headers.get("set-cookie") ?? "";
  assert.match(cookies, /session=.*HttpOnly/);
  assert.match(cookies, /session=.*Secure/);
  assert.match(cookies, /csrf=.*Secure/);
  assert.equal(repository.auditEvents.filter((event) => event.action === "auth.login" && event.outcome === "success").length, 1);
});

test("unverified or invalid credentials use the same generic response", async () => {
  const { app } = setup();
  const invalid = await app.request("http://localhost/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.20" },
    body: JSON.stringify({ email: "missing@example.com", password: "a long safe 密码 123" }),
  });
  assert.equal(invalid.status, 401);
  const invalidBody = (await invalid.json()) as { code: string; message: string };

  await app.request("http://localhost/api/v1/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "unverified@example.com", password: "a long safe 密码 123" }),
  });
  const unverified = await app.request("http://localhost/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.21" },
    body: JSON.stringify({ email: "unverified@example.com", password: "a long safe 密码 123" }),
  });
  assert.equal(unverified.status, 401);
  const unverifiedBody = (await unverified.json()) as { code: string; message: string };
  assert.deepEqual(
    { code: unverifiedBody.code, message: unverifiedBody.message },
    { code: invalidBody.code, message: invalidBody.message },
  );
});

test("logout requires the session CSRF token and revokes the session", async () => {
  const fixture = setup();
  await fixture.app.request("http://localhost/api/v1/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "logout@example.com", password: "a long safe 密码 123" }),
  });
  await fixture.app.request(`http://localhost/api/v1/auth/verify-email?token=${fixture.sent[0]!.token}`);
  const login = await fixture.app.request("http://localhost/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "logout@example.com", password: "a long safe 密码 123" }),
  });
  const cookieHeader = (login.headers.get("set-cookie") ?? "").split(", ").map((cookie) => cookie.split(";")[0]).join("; ");
  const csrf = cookieHeader.match(/csrf=([^;]+)/)?.[1];
  const withoutCsrf = await fixture.app.request("http://localhost/api/v1/auth/logout", { method: "POST", headers: { cookie: cookieHeader } });
  assert.equal(withoutCsrf.status, 403);
  const logout = await fixture.app.request("http://localhost/api/v1/auth/logout", { method: "POST", headers: { cookie: cookieHeader, "x-csrf-token": csrf! } });
  assert.equal(logout.status, 204);
  const me = await fixture.app.request("http://localhost/api/v1/me", { headers: { cookie: cookieHeader } });
  assert.equal(me.status, 401);
});

for (const [name, run] of cases) {
  await run();
  console.log(`PASS ${name}`);
}
