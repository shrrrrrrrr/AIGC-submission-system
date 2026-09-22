import { serve } from "@hono/node-server";
import { randomBytes } from "node:crypto";
import { createApp } from "./app.js";
import { MfaService } from "./auth/mfa.js";
import { InMemoryAuthRepository } from "./auth/repository.js";
import { AuthService } from "./auth/service.js";

if (process.env.NODE_ENV === "production") {
  throw new Error("生产环境禁止使用内存仓储；请先配置并启用 PostgreSQL 适配器");
}

const repository = new InMemoryAuthRepository();
const mfaKey = process.env.MFA_ENCRYPTION_KEY ? Buffer.from(process.env.MFA_ENCRYPTION_KEY, "base64url") : randomBytes(32);
const mfa = new MfaService(repository, mfaKey);
const mailer = {
  async sendEmailVerification(email: string, rawToken: string): Promise<void> {
    void rawToken;
    console.info(JSON.stringify({ event: "email_verification_stub", email }));
  },
  async sendPasswordReset(email: string, rawToken: string): Promise<void> {
    void rawToken;
    console.info(JSON.stringify({ event: "password_reset_stub", email }));
  },
};
const app = createApp({ auth: new AuthService(repository, mailer), mfa });
const port = Number(process.env.PORT || 3000);

serve({ fetch: app.fetch, port });
console.info(`ChinaVR auth server listening on http://localhost:${port}`);
