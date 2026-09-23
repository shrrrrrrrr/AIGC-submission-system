import assert from "node:assert/strict";
import { SingleSendMailRequest } from "@alicloud/dm20151123";
import { DirectMailMailer, createDirectMailClientFromEnv, createDirectMailMailerFromEnv } from "../src/auth/directmail.js";

const requests: SingleSendMailRequest[] = [];
const client = {
  async singleSendMail(request: SingleSendMailRequest): Promise<void> {
    requests.push(request);
  },
};

const mailer = new DirectMailMailer({
  client,
  fromAddress: "noreply@mail-test.otherworld-studio.cn",
  publicUrl: "https://submit.example.test",
  tagName: "local_test",
});

await mailer.sendEmailVerification("shrbuaa@qq.com", "token&<one>");
assert.equal(requests.length, 1);
assert.equal(requests[0]?.accountName, "noreply@mail-test.otherworld-studio.cn");
assert.equal(requests[0]?.addressType, 1);
assert.equal(requests[0]?.replyToAddress, true);
assert.equal(requests[0]?.toAddress, "shrbuaa@qq.com");
assert.equal(requests[0]?.tagName, "local_test");
assert.match(String(requests[0]?.textBody), /token%26%3Cone%3E/);
assert.match(String(requests[0]?.htmlBody), /token%26%3Cone%3E/);
assert.doesNotMatch(String(requests[0]?.htmlBody), /<one>/);
console.log("PASS DirectMail builds a verified reply-to request and escapes token links");

await mailer.sendPasswordReset("shrbuaa@qq.com", "reset-token");
assert.equal(requests.length, 2);
assert.match(String(requests[1]?.textBody), /\/reset-password\?token=reset-token/);
console.log("PASS DirectMail builds the password reset link");

const failingMailer = new DirectMailMailer({
  client: {
    async singleSendMail(): Promise<void> {
      throw new Error("provider payload leaked shrbuaa@qq.com and secret");
    },
  },
  fromAddress: "noreply@mail-test.otherworld-studio.cn",
  publicUrl: "https://submit.example.test",
});
await assert.rejects(() => failingMailer.sendEmailVerification("shrbuaa@qq.com", "secret"), (error: unknown) => {
  assert.equal(error instanceof Error ? error.message : error, "DirectMail 发信失败");
  return true;
});
console.log("PASS DirectMail redacts provider errors");

assert.throws(
  () => new DirectMailMailer({ client, fromAddress: "noreply@example.test", publicUrl: "http://example.test" }),
  /HTTPS/,
);
assert.throws(
  () => new DirectMailMailer({ client, fromAddress: "noreply@example.test", publicUrl: "http://localhost:3000", tagName: "bad tag" }),
  /MAILER_TAG_NAME/,
);
console.log("PASS DirectMail validates public URL and tag configuration");

assert.throws(
  () => createDirectMailClientFromEnv({ MAILER_ACCESS_KEY_ID: "", MAILER_ACCESS_KEY_SECRET: "secret" }),
  /MAILER_ACCESS_KEY_ID/,
);
assert.throws(
  () => createDirectMailMailerFromEnv({
    MAILER_ACCESS_KEY_ID: "test-id",
    MAILER_ACCESS_KEY_SECRET: "test-secret",
    MAILER_FROM_ADDRESS: "noreply@example.test",
    APP_PUBLIC_URL: "http://example.test",
  }),
  /HTTPS/,
);
const envMailer = createDirectMailMailerFromEnv({
  MAILER_ACCESS_KEY_ID: "test-id",
  MAILER_ACCESS_KEY_SECRET: "test-secret",
  MAILER_FROM_ADDRESS: "noreply@example.test",
  APP_PUBLIC_URL: "http://localhost:3000",
  MAILER_REGION: "cn-hangzhou",
});
assert.ok(envMailer instanceof DirectMailMailer);
console.log("PASS DirectMail reads required environment variables without sending a network request");
