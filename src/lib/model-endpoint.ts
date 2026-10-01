/**
 * 模型服务 Base URL 安全校验（防 SSRF）
 *
 * 供应商 Base URL 会由服务端直接 fetch，必须阻断：
 *  - 非 https（生产）；
 *  - 本机 / 回环 / 私网 / 链路本地 / 云元数据地址（如 169.254.169.254）；
 *  - 携带凭据或非常规端口的异常地址。
 *
 * 仅当显式设置 MODEL_ALLOW_INSECURE_LOCAL=true（测试环境）时才允许回环地址上的 http，
 * 用于本地 mock 供应商联调，严禁在生产开启。
 */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const ALLOW_INSECURE_LOCAL = () => process.env.MODEL_ALLOW_INSECURE_LOCAL === "true";

function parseIpv4(value: string): [number, number, number, number] | null {
  const parts = value.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d+$/.test(part))) return null;
  const octets = parts.map(Number);
  return octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255)
    ? (octets as [number, number, number, number])
    : null;
}

function parseIpv6(value: string): number[] | null {
  const normalized = value.toLowerCase();
  const halves = normalized.split("::");
  if (halves.length > 2) return null;

  const parseGroups = (part: string): number[] | null => {
    if (!part) return [];
    const rawGroups = part.split(":");
    const groups: number[] = [];
    for (const raw of rawGroups) {
      if (raw.includes(".")) {
        const octets = parseIpv4(raw);
        if (!octets) return null;
        groups.push((octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3]);
      } else if (/^[0-9a-f]{1,4}$/.test(raw)) {
        groups.push(parseInt(raw, 16));
      } else {
        return null;
      }
    }
    return groups;
  };

  const left = parseGroups(halves[0]);
  const right = parseGroups(halves[1] ?? "");
  if (!left || !right) return null;
  if (halves.length === 1) return left.length === 8 ? left : null;
  if (left.length + right.length >= 8) return null;
  return [...left, ...Array(8 - left.length - right.length).fill(0), ...right];
}

function getEmbeddedIpv4(host: string): [number, number, number, number] | null {
  if (isIP(host) !== 6) return null;
  const groups = parseIpv6(host);
  if (!groups || groups.length !== 8) return null;
  const isMapped = groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
  const isCompatible = groups.slice(0, 6).every((group) => group === 0);
  if (!isMapped && !isCompatible) return null;
  return [groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff];
}

function isBlockedIpv4(octets: [number, number, number, number]): boolean {
  const [a, b] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 203 && b === 0) ||
    a >= 224
  );
}

function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  if (!h) return true;
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local")) return true;
  // 云元数据服务与内部域名
  if (h === "metadata" || h.endsWith(".internal") || h.includes("metadata.google")) return true;
  const ipv4 = parseIpv4(h) ?? getEmbeddedIpv4(h);
  if (ipv4) return isBlockedIpv4(ipv4);
  if (h === "::1" || h === "0:0:0:0:0:0:0:1" || h === "::" || h === "0.0.0.0") return true;
  // IPv6 唯一本地地址 fc00::/7、链路本地 fe80::/10
  if (/^(fc|fd|fe[89ab])/.test(h)) return true;
  return false;
}

/**
 * 判断主机是否为本地/自托管目标（回环、私网、链路本地），用于 MODEL_ALLOW_INSECURE_LOCAL 开关放行。
 * 云元数据地址（169.254.169.254 / metadata.google / *.internal）始终视为不可信，须由 isBlockedHost 继续拦截。
 */
function isLocalTargetHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  if (!h) return false;
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local")) return true;
  if (h === "::1" || h === "0:0:0:0:0:0:0:1" || h === "::" || h === "0.0.0.0") return true;
  const ipv4 = parseIpv4(h) ?? getEmbeddedIpv4(h);
  if (ipv4) {
    // 云元数据服务必须始终拦截，防止实例凭证外泄
    if (ipv4[0] === 169 && ipv4[1] === 254 && ipv4[2] === 169 && ipv4[3] === 254) return false;
    return isBlockedIpv4(ipv4);
  }
  if (/^(fc|fd|fe[89ab])/.test(h)) return true; // IPv6 唯一本地 / 链路本地
  return false;
}

/**
 * 校验模型服务 Base URL。
 * @returns { ok: true, url } 或 { ok: false, error }
 */
export function validateModelBaseUrl(raw: string): { ok: true; url: string } | { ok: false; error: string } {
  const value = (raw || "").trim();
  if (!value) return { ok: false, error: "Base URL 不能为空" };

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, error: "Base URL 格式非法，需为完整地址（如 https://api.example.com/v1）" };
  }

  if (parsed.username || parsed.password) {
    return { ok: false, error: "Base URL 不得包含账号密码等凭据信息" };
  }

  const host = parsed.hostname;
  const insecureLocal = ALLOW_INSECURE_LOCAL();
  const localTarget = isLocalTargetHost(host);

  // 本地/自托管模型（Ollama、vLLM、内部网关等）常无 TLS：显式开启 MODEL_ALLOW_INSECURE_LOCAL 后
  // 放行回环/私网目标的 http 与 https，便于联调；公网主机仍强制 https。
  if (parsed.protocol === "http:") {
    if (insecureLocal && localTarget) return { ok: true, url: value };
    return {
      ok: false,
      error: insecureLocal
        ? "该 http 地址指向公网主机，为保障安全仅允许回环/私网目标的 http（MODEL_ALLOW_INSECURE_LOCAL 仅放行本地/自托管模型）"
        : "仅允许 https 协议（本地/自托管模型联调请设置 MODEL_ALLOW_INSECURE_LOCAL=true 后使用 http）",
    };
  }

  if (localTarget) {
    if (insecureLocal) return { ok: true, url: value };
    return {
      ok: false,
      error: "Base URL 指向本机/内网地址，存在 SSRF 风险；本地联调请设置 MODEL_ALLOW_INSECURE_LOCAL=true 后放行。",
    };
  }

  if (isBlockedHost(host)) {
    return { ok: false, error: "Base URL 指向本机 / 内网 / 链路本地或元数据地址，存在 SSRF 风险，已拒绝" };
  }

  return { ok: true, url: value };
}

/** 断言版本：不合法直接抛出（供创建/更新接口复用） */
export function assertSafeModelBaseUrl(raw: string): string {
  const r = validateModelBaseUrl(raw);
  if (!r.ok) throw new Error(r.error);
  return r.url;
}

/**
 * 在实际建立连接前再次解析主机名并校验所有结果，阻断公共域名解析到内网的 SSRF。
 * 该检查不能替代网络层 egress 防火墙，但可覆盖 nip.io、DNS 重绑定前置解析等常见路径。
 */
export async function validateModelBaseUrlForRequest(
  raw: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const lexical = validateModelBaseUrl(raw);
  if (!lexical.ok) return lexical;
  const parsed = new URL(lexical.url);
  const host = parsed.hostname.replace(/^\[/, "").replace(/\]$/, "");

  // 测试开关允许的本地 http 已在同步校验中明确放行。
  if (parsed.protocol === "http:") return lexical;
  // 显式开启 insecure-local 时，本地/私网 https 目标（自签名证书的内部网关）一并放行
  if (ALLOW_INSECURE_LOCAL() && isLocalTargetHost(host)) return lexical;
  if (isBlockedHost(host)) {
    return { ok: false, error: "模型服务地址解析为本机 / 内网 / 链路本地地址，存在 SSRF 风险，已拒绝" };
  }

  if (isIP(host)) return lexical;
  try {
    const records = await lookup(host, { all: true, verbatim: true });
    if (!records.length || records.some((record) => isBlockedHost(record.address))) {
      return { ok: false, error: "模型服务域名解析到本机 / 内网 / 链路本地地址，存在 SSRF 风险，已拒绝" };
    }
  } catch {
    return { ok: false, error: "模型服务域名无法解析，已拒绝连接" };
  }
  return lexical;
}

/** 受支持的对接协议（后台可配置；适配器按此分发到对应实现） */
export const SUPPORTED_MODEL_PROTOCOLS = [
  "OPENAI_COMPATIBLE",
  "ANTHROPIC",
  "GEMINI",
] as const;

/** 校验协议是否受支持 */
export function isSupportedModelProtocol(protocol: string): boolean {
  return (SUPPORTED_MODEL_PROTOCOLS as readonly string[]).includes((protocol || "").trim().toUpperCase());
}
