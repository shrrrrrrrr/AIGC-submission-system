/**
 * Approved public video/share hosts used by the submission contract.
 *
 * The entries are intentionally exact host names.  A host such as
 * `example.com.evil.test` must never be accepted because it merely ends in
 * an approved-looking suffix.
 */
export const DEFAULT_VIDEO_HOSTS = [
  "douyin.com",
  "www.douyin.com",
  "v.douyin.com",
  "iesdouyin.com",
  "bilibili.com",
  "www.bilibili.com",
  "b23.tv",
  "xiaohongshu.com",
  "www.xiaohongshu.com",
  "xhslink.com",
  "weixin.qq.com",
  "www.weixin.qq.com",
  "channels.weixin.qq.com",
] as const;

export type VideoUrlErrorCode =
  | "VALIDATION_ERROR"
  | "UNSAFE_URL"
  | "UNSUPPORTED_PLATFORM";

/** A stable error contract for user supplied video/share links. */
export class VideoUrlError extends Error {
  readonly code: VideoUrlErrorCode;

  constructor(code: VideoUrlErrorCode, message: string) {
    super(message);
    this.name = "VideoUrlError";
    this.code = code;
  }
}

type ApprovedHosts = Iterable<string>;

const URL_SCHEME_PATTERN = /https?:\/\//gi;
const URL_TOKEN_PATTERN = /https?:\/\/[^\s<>"'，。；！？、【】（）()<>]+/gi;
const TRAILING_URL_PUNCTUATION = /[.,;:!?，。；：！？、）》】\]}]+$/u;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;

/**
 * Normalize a user supplied share link to an HTTPS URL.
 *
 * Input may contain a short piece of explanatory copy, but it must contain
 * exactly one HTTP(S) URL.  `approvedHosts` defaults to the built-in list;
 * passing an empty iterable is deliberately fail-closed and accepts no host.
 */
export function normalizeVideoShareInput(
  input: unknown,
  approvedHosts: ApprovedHosts = DEFAULT_VIDEO_HOSTS,
): string {
  if (typeof input !== "string") {
    throw new VideoUrlError("VALIDATION_ERROR", "视频链接必须是文本");
  }

  const value = input.trim();
  if (!value || value.length > 4096 || CONTROL_CHARACTER_PATTERN.test(value)) {
    throw new VideoUrlError("VALIDATION_ERROR", "请提供一个公开视频链接");
  }

  // Count scheme occurrences separately from token extraction.  This prevents
  // a malformed second URL from being silently treated as copy text.
  const nonHttpScheme = /\b(?!https?:\/\/)[a-z][a-z0-9+.-]*:\/\//iu;
  if (nonHttpScheme.test(value)) {
    throw new VideoUrlError("UNSAFE_URL", "不支持 App 深链，请粘贴 HTTP(S) 网页链接");
  }

  const schemeMatches = value.match(URL_SCHEME_PATTERN) ?? [];
  if (schemeMatches.length !== 1) {
    throw new VideoUrlError("VALIDATION_ERROR", "请输入且仅输入一个 HTTP(S) 视频链接");
  }

  const tokenMatches = value.match(URL_TOKEN_PATTERN) ?? [];
  if (tokenMatches.length !== 1) {
    throw new VideoUrlError("VALIDATION_ERROR", "请输入且仅输入一个有效视频链接");
  }

  const token = tokenMatches[0].replace(TRAILING_URL_PUNCTUATION, "");
  if (!token) {
    throw new VideoUrlError("VALIDATION_ERROR", "视频链接格式无效");
  }

  let parsed: URL;
  try {
    parsed = new URL(token);
  } catch {
    throw new VideoUrlError("VALIDATION_ERROR", "视频链接格式无效");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new VideoUrlError("UNSAFE_URL", "仅支持 HTTP 或 HTTPS 视频链接");
  }

  // URL.username/password are decoded views and therefore do not reliably
  // reveal all malformed credential forms.  Inspecting the raw authority also
  // catches an explicit port (including :80/:443), which is never needed for
  // an external share link and could bypass host allow-list assumptions.
  const authority = token.slice(token.indexOf("://") + 3).split(/[/?#]/u, 1)[0] ?? "";
  if (authority.includes("@") || authority.includes(":")) {
    throw new VideoUrlError("UNSAFE_URL", "视频链接不得包含账号、密码或端口");
  }
  if (parsed.username || parsed.password || parsed.port) {
    throw new VideoUrlError("UNSAFE_URL", "视频链接不得包含账号、密码或端口");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!hostname || isIpAddress(hostname) || hostname.endsWith(".")) {
    throw new VideoUrlError("UNSAFE_URL", "视频链接主机必须是受支持的公网域名");
  }

  const approved = new Set(
    Array.from(approvedHosts ?? [], (host) => host.trim().toLowerCase()).filter(Boolean),
  );
  if (!approved.has(hostname)) {
    throw new VideoUrlError("UNSUPPORTED_PLATFORM", "该视频平台未获批准");
  }

  // Fragments are client-only state and are intentionally removed.  Keep the
  // path and query exactly as parsed; query parameters are often required to
  // resolve a share link.
  const normalizedProtocol = "https:";
  const normalized = `${normalizedProtocol}//${hostname}${parsed.pathname}${parsed.search}`;
  if (normalized.length > 2048) throw new VideoUrlError("VALIDATION_ERROR", "规范化后的视频链接不能超过 2,048 个字符");
  return normalized;
}

function isIpAddress(hostname: string): boolean {
  // IPv6 is represented by URL.hostname without brackets in modern runtimes.
  if (hostname.includes(":")) return true;
  const octets = hostname.split(".");
  if (octets.length !== 4 || !octets.every((octet) => /^\d{1,3}$/u.test(octet))) return false;
  return octets.every((octet) => Number(octet) >= 0 && Number(octet) <= 255);
}
