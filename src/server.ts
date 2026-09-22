import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { InMemoryAuthRepository } from "./auth/repository.js";
import { AuthService } from "./auth/service.js";

if (process.env.NODE_ENV === "production") {
  throw new Error("生产环境禁止使用内存仓储；请先配置并启用 PostgreSQL 适配器");
}

const repository = new InMemoryAuthRepository();
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
const app = createApp({ auth: new AuthService(repository, mailer) });
const port = Number(process.env.PORT || 3000);

serve({ fetch: app.fetch, port });
console.info(`ChinaVR auth server listening on http://localhost:${port}`);
