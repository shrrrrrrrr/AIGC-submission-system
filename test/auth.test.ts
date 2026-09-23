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
    async sendPasswordReset(email, token) {
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

test("passwords accept six characters and reject shorter values", async () => {
  const fixture = setup();
  const short = await fixture.app.request("http://localhost/api/v1/auth/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "short@example.com", password: "12345" }) });
  assert.equal(short.status, 422);
  const minimum = await fixture.app.request("http://localhost/api/v1/auth/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "minimum@example.com", password: "123456" }) });
  assert.equal(minimum.status, 202);
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
  const cookies = login.headers.getSetCookie().join(", ");
  assert.match(cookies, /__Host-chinavr-session=.*HttpOnly/);
  assert.match(cookies, /__Host-chinavr-session=.*Secure/);
  assert.match(cookies, /chinavr-csrf=.*Secure/);
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
  const cookieHeader = login.headers.getSetCookie().map((cookie) => cookie.split(";")[0]).join("; ");
  const csrf = cookieHeader.match(/chinavr-csrf=([^;]+)/)?.[1];
  const withoutCsrf = await fixture.app.request("http://localhost/api/v1/auth/logout", { method: "POST", headers: { cookie: cookieHeader } });
  assert.equal(withoutCsrf.status, 403);
  const logout = await fixture.app.request("http://localhost/api/v1/auth/logout", { method: "POST", headers: { cookie: cookieHeader, "x-csrf-token": csrf! } });
  assert.equal(logout.status, 204);
  const me = await fixture.app.request("http://localhost/api/v1/me", { headers: { cookie: cookieHeader } });
  assert.equal(me.status, 401);
});

test("password reset response is generic, token is one-time, and sessions are revoked", async () => {
  const fixture = setup();
  await fixture.app.request("http://localhost/api/v1/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "reset@example.com", password: "a long safe 密码 123" }),
  });
  await fixture.app.request(`http://localhost/api/v1/auth/verify-email?token=${fixture.sent[0]!.token}`);
  const login = await fixture.app.request("http://localhost/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "reset@example.com", password: "a long safe 密码 123" }),
  });
  const oldCookie = login.headers.getSetCookie().map((cookie) => cookie.split(";")[0]).join("; ");
  const existingRequest = await fixture.app.request("http://localhost/api/v1/auth/password-reset/request", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "reset@example.com" }),
  });
  const missingRequest = await fixture.app.request("http://localhost/api/v1/auth/password-reset/request", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "missing-reset@example.com" }),
  });
  const existingBody = (await existingRequest.json()) as { message: string };
  const missingBody = (await missingRequest.json()) as { message: string };
  assert.equal(existingRequest.status, 202);
  assert.equal(missingRequest.status, 202);
  assert.equal(existingBody.message, missingBody.message);

  const resetToken = fixture.sent[1]!.token;
  const reset = await fixture.app.request("http://localhost/api/v1/auth/password-reset/confirm", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: resetToken, newPassword: "a different safe 密码 456" }),
  });
  assert.equal(reset.status, 204);
  const replay = await fixture.app.request("http://localhost/api/v1/auth/password-reset/confirm", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: resetToken, newPassword: "a different safe 密码 456" }),
  });
  assert.equal(replay.status, 400);
  const oldMe = await fixture.app.request("http://localhost/api/v1/me", { headers: { cookie: oldCookie } });
  assert.equal(oldMe.status, 401);
});

test("reviewer and administrator accounts cannot bypass MFA", async () => {
  const fixture = setup();
  await fixture.app.request("http://localhost/api/v1/auth/register", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "reviewer@example.com", password: "a long safe 密码 123" }),
  });
  await fixture.app.request(`http://localhost/api/v1/auth/verify-email?token=${fixture.sent[0]!.token}`);
  const user = [...fixture.repository.users.values()][0]!;
  fixture.repository.users.set(user.id, { ...user, roles: ["reviewer"], mfaEnabled: false });
  const login = await fixture.app.request("http://localhost/api/v1/auth/login", {
    method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.77" },
    body: JSON.stringify({ email: "reviewer@example.com", password: "a long safe 密码 123" }),
  });
  assert.equal(login.status, 401);
  const body = (await login.json()) as { code: string };
  assert.equal(body.code, "MFA_REQUIRED");
});

for (const [name, run] of cases) {
  await run();
  console.log(`PASS ${name}`);
}
