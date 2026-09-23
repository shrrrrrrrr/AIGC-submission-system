import { isIP } from "node:net";

export type LinkPrecheckFinding = { code: string; field: string; message: string };
export type LinkPrecheckResult = {
  provider: string | null;
  canonicalUrl: string | null;
  precheckStatus: "passed" | "failed";
  failureCode: string | null;
  findings: LinkPrecheckFinding[];
};

/**
 * Deterministic, local part of link prechecking. It deliberately does not
 * fetch user URLs: a network adapter/worker must supply metadata before pass.
 */
export function inspectVideoLink(originalUrl: string, approvedHosts: readonly string[]): LinkPrecheckResult {
  let url: URL;
  try { url = new URL(originalUrl); }
  catch { return failed("URL_INVALID", [{ code: "URL_INVALID", field: "url", message: "链接不是有效的 URL" }]); }
  const hostname = url.hostname.toLowerCase();
  const hosts = new Set(approvedHosts.map((host) => host.trim().toLowerCase()).filter(Boolean));
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") || isIP(hostname) !== 0 || hostname === "localhost" || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    return failed("UNSAFE_URL", [{ code: "UNSAFE_URL", field: "url", message: "链接必须使用 HTTPS 且指向公网视频平台" }]);
  }
  if (!hosts.has(hostname)) return failed("UNSUPPORTED_PLATFORM", [{ code: "UNSUPPORTED_PLATFORM", field: "url", message: "该主机名不在赛事视频平台白名单中" }]);
  const provider = providerForHost(hostname);
  if (!provider) return failed("UNSUPPORTED_PLATFORM", [{ code: "UNSUPPORTED_PLATFORM", field: "url", message: "该主机名暂未配置平台适配器" }]);
  url.hash = "";
  return {
    provider,
    canonicalUrl: url.toString(),
    precheckStatus: "failed",
    failureCode: "METADATA_UNAVAILABLE",
    findings: [{ code: "METADATA_UNAVAILABLE", field: "metadata", message: "平台元数据适配器尚未配置，暂不能确认公开性、时长和分辨率" }],
  };
}

function providerForHost(hostname: string): string | null {
  if (hostname === "douyin.com" || hostname.endsWith(".douyin.com") || hostname === "iesdouyin.com" || hostname.endsWith(".iesdouyin.com")) return "douyin";
  if (hostname === "bilibili.com" || hostname.endsWith(".bilibili.com") || hostname === "b23.tv") return "bilibili";
  if (hostname === "xiaohongshu.com" || hostname.endsWith(".xiaohongshu.com") || hostname === "xhslink.com") return "xiaohongshu";
  if (hostname === "weixin.qq.com" || hostname.endsWith(".weixin.qq.com")) return "channels";
  return null;
}

function failed(failureCode: string, findings: LinkPrecheckFinding[]): LinkPrecheckResult {
  return { provider: null, canonicalUrl: null, precheckStatus: "failed", failureCode, findings };
}
