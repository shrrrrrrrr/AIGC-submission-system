import { createDirectMailMailerFromEnv } from "../src/auth/directmail.js";

if (process.env.MAILER_MODE?.trim().toLowerCase() !== "directmail") {
  throw new Error("本地 DirectMail 冒烟测试必须设置 MAILER_MODE=directmail");
}

const recipient = process.env.MAILER_TEST_RECIPIENT?.trim();
if (!recipient) throw new Error("本地 DirectMail 冒烟测试必须设置 MAILER_TEST_RECIPIENT");

const mailer = createDirectMailMailerFromEnv(process.env);
await mailer.sendConnectivityTest(recipient);
console.log(`DirectMail 冒烟邮件已提交，收件人：${recipient}`);
