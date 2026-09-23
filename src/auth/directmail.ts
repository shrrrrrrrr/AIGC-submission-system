import { createRequire } from "node:module";
import { SingleSendMailRequest } from "@alicloud/dm20151123";
import { $OpenApiUtil } from "@alicloud/openapi-core";
import type { Mailer } from "./service.js";

type DirectMailClient = {
  singleSendMail(request: SingleSendMailRequest): Promise<unknown>;
};

type DirectMailSdkConstructor = new (config: $OpenApiUtil.Config) => DirectMailClient;

const require = createRequire(import.meta.url);

export type DirectMailMailerOptions = {
  client: DirectMailClient;
  fromAddress: string;
  publicUrl: string;
  tagName?: string;
};

export class DirectMailMailer implements Mailer {
  private readonly publicUrl: URL;

  constructor(private readonly options: DirectMailMailerOptions) {
    validateEmail(options.fromAddress, "MAILER_FROM_ADDRESS");
    this.publicUrl = parsePublicUrl(options.publicUrl);
    if (options.tagName !== undefined && !/^[A-Za-z0-9_-]{1,128}$/.test(options.tagName)) throw new Error("MAILER_TAG_NAME 格式无效");
  }

  async sendEmailVerification(email: string, rawToken: string): Promise<void> {
    const url = new URL("/api/v1/auth/verify-email", this.publicUrl);
    url.searchParams.set("token", rawToken);
    await this.send(email, "ChinaVR 2026 邮箱验证", "请打开以下链接完成邮箱验证：", url.toString());
  }

  async sendPasswordReset(email: string, rawToken: string): Promise<void> {
    const url = new URL("/reset-password", this.publicUrl);
    url.searchParams.set("token", rawToken);
    await this.send(email, "ChinaVR 2026 密码重置", "请打开以下链接重置密码：", url.toString());
  }

  private async send(email: string, subject: string, description: string, link: string): Promise<void> {
    validateEmail(email, "收件人邮箱");
    const safeLink = escapeHtml(link);
    const request = new SingleSendMailRequest({
      accountName: this.options.fromAddress,
      addressType: 1,
      replyToAddress: true,
      toAddress: email,
      subject,
      textBody: `${description}\n${link}`,
      htmlBody: `<p>${description}</p><p><a href="${safeLink}">${safeLink}</a></p>`,
      clickTrace: "0",
      ...(this.options.tagName === undefined ? {} : { tagName: this.options.tagName }),
    });
    try {
      await this.options.client.singleSendMail(request);
    } catch {
      // Provider errors may contain addresses or request parameters; do not expose them to the HTTP layer.
      throw new Error("DirectMail 发信失败");
    }
  }
}

export function createDirectMailClientFromEnv(env: NodeJS.ProcessEnv = process.env): DirectMailClient {
  const accessKeyId = requiredEnv(env.MAILER_ACCESS_KEY_ID, "MAILER_ACCESS_KEY_ID");
  const accessKeySecret = requiredEnv(env.MAILER_ACCESS_KEY_SECRET, "MAILER_ACCESS_KEY_SECRET");
  const regionId = (env.MAILER_REGION || "cn-hangzhou").trim();
  if (!/^[a-z0-9-]{2,32}$/.test(regionId)) throw new Error("MAILER_REGION 格式无效");
  const config = new $OpenApiUtil.Config({
    accessKeyId,
    accessKeySecret,
    regionId,
    endpoint: env.MAILER_ENDPOINT?.trim() || "dm.aliyuncs.com",
    protocol: "https",
    connectTimeout: 5_000,
    readTimeout: 10_000,
  });
  const sdk = require("@alicloud/dm20151123") as { default?: DirectMailSdkConstructor };
  if (!sdk.default) throw new Error("DirectMail SDK 加载失败");
  return new sdk.default(config);
}

export function createDirectMailMailerFromEnv(env: NodeJS.ProcessEnv = process.env): DirectMailMailer {
  return new DirectMailMailer({
    client: createDirectMailClientFromEnv(env),
    fromAddress: requiredEnv(env.MAILER_FROM_ADDRESS, "MAILER_FROM_ADDRESS"),
    publicUrl: requiredEnv(env.APP_PUBLIC_URL, "APP_PUBLIC_URL"),
    ...(env.MAILER_TAG_NAME?.trim() ? { tagName: env.MAILER_TAG_NAME.trim() } : {}),
  });
}

function requiredEnv(value: string | undefined, name: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`生产环境必须配置 ${name}`);
  return normalized;
}

function validateEmail(value: string, field: string): void {
  if (value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error(`${field} 格式无效`);
}

function parsePublicUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("APP_PUBLIC_URL 必须是有效的 URL");
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) throw new Error("APP_PUBLIC_URL 生产环境必须使用 HTTPS");
  if (url.username || url.password || url.search || url.hash) throw new Error("APP_PUBLIC_URL 不得包含凭据、查询参数或片段");
  return url;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}
