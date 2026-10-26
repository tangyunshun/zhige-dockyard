import crypto from "crypto";
import fs from "fs";

/**
 * 微信支付 APIv3（Native 扫码支付）自包含实现——零第三方 SDK，全部用 node:crypto 完成真实签名与验签。
 *
 * 所需环境变量（与 isRealGatewayConfigured 契约一致）：
 *   WECHATPAY_APP_ID            商户绑定的 appid
 *   WECHATPAY_MCH_ID            商户号
 *   WECHATPAY_API_V3_KEY        APIv3 密钥（32 字节，用于回包/证书解密）
 *   WECHATPAY_SERIAL_NO         商户 API 证书序列号
 *   WECHATPAY_PRIVATE_KEY_PATH  商户私钥 PEM 文件路径（apiclient_key.pem）
 *   PAYMENT_NOTIFY_HOST         对外可达域名（回调通知 base url）
 *
 * 语义约束（与项目账务红线一致）：
 * - 下单（createNativeOrder）绝不入账；入账只发生在 /api/payments/notify/wechat 验签通过后。
 * - 回调必须验签（平台证书）+ AES-256-GCM 解密 + 状态判断 + 幂等，缺一不可。
 */

const GATEWAY_BASE = process.env.WECHAT_PAY_GATEWAY || "https://api.mch.weixin.qq.com";

export function getWechatPayConfig() {
  const appId = process.env.WECHATPAY_APP_ID || "";
  const mchId = process.env.WECHATPAY_MCH_ID || "";
  const apiV3Key = process.env.WECHATPAY_API_V3_KEY || "";
  const serialNo = process.env.WECHATPAY_SERIAL_NO || "";
  const keyPath = process.env.WECHATPAY_PRIVATE_KEY_PATH || "";
  let privateKey = "";
  if (keyPath) {
    try {
      privateKey = fs.readFileSync(keyPath, "utf-8");
    } catch {
      privateKey = "";
    }
  }
  return { appId, mchId, apiV3Key, serialNo, privateKey };
}

export function isWechatPayConfigured(): boolean {
  const c = getWechatPayConfig();
  return !!(c.appId && c.mchId && c.apiV3Key && c.serialNo && c.privateKey);
}

function rsaSignSha256(privateKeyPem: string, message: string): string {
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(message);
  return signer.sign(privateKeyPem, "base64");
}

function randomNonce(): string {
  return crypto.randomBytes(16).toString("hex");
}

/** 构造 APIv3 请求头 Authorization（对 method\nurl\ntimestamp\nnonce\nbody\n 签名） */
function buildAuthorization(method: string, urlPath: string, body: string): string | null {
  const c = getWechatPayConfig();
  if (!c.privateKey) return null;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomNonce();
  const message = `${method}\n${urlPath}\n${timestamp}\n${nonce}\n${body}\n`;
  const signature = rsaSignSha256(c.privateKey, message);
  return `WECHATPAY2-SHA256-RSA2048 mchid="${c.mchId}",nonce_str="${nonce}",signature="${signature}",timestamp="${timestamp}",serial_no="${c.serialNo}"`;
}

export interface WechatNativeOrderResult {
  ok: boolean;
  codeUrl?: string;
  error?: string;
}

/** 创建 Native 扫码支付单（真实请求微信侧，返回 code_url 二维码链接；不入账） */
export async function createNativeOrder(params: {
  orderNo: string;
  amountCents: number;
  description: string;
  expiresAt?: Date | null;
}): Promise<WechatNativeOrderResult> {
  const c = getWechatPayConfig();
  if (!isWechatPayConfigured()) {
    return { ok: false, error: "微信支付凭证未配置完整，拒绝下单" };
  }
  const notifyHost = (process.env.PAYMENT_NOTIFY_HOST || "").replace(/\/$/, "");
  if (!notifyHost) {
    return { ok: false, error: "PAYMENT_NOTIFY_HOST 未配置，无法接收支付回调，拒绝下单" };
  }

  const body: Record<string, unknown> = {
    appid: c.appId,
    mchid: c.mchId,
    description: params.description.slice(0, 127),
    out_trade_no: params.orderNo,
    notify_url: `${notifyHost}/api/payments/notify/wechat`,
    amount: { total: params.amountCents, currency: "CNY" },
  };
  if (params.expiresAt) {
    // RFC3339（北京时间），与订单本地 expiresAt 生命周期保持一致
    const pad = (n: number) => String(n).padStart(2, "0");
    const d = params.expiresAt;
    body.time_expire = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}+08:00`;
  }

  const urlPath = "/v3/pay/transactions/native";
  const bodyStr = JSON.stringify(body);
  const authorization = buildAuthorization("POST", urlPath, bodyStr);
  if (!authorization) return { ok: false, error: "微信支付私钥不可用，签名失败" };

  try {
    const res = await fetch(`${GATEWAY_BASE}${urlPath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: authorization,
        "User-Agent": "zhige-dockyard/1.0",
      },
      body: bodyStr,
    });
    const json = (await res.json().catch(() => ({}))) as { code_url?: string; code?: string; message?: string };
    if (!res.ok || !json.code_url) {
      return { ok: false, error: `微信下单失败(HTTP ${res.status}): ${json.message || json.code || "未知错误"}` };
    }
    return { ok: true, codeUrl: json.code_url };
  } catch (e) {
    return { ok: false, error: `微信下单网络异常: ${(e as Error).message}` };
  }
}

// ─────────────────── 回调验签与资源解密 ───────────────────

interface PlatformCertCache {
  serials: Map<string, string>; // serial -> public key PEM
  fetchedAt: number;
}
const g = globalThis as unknown as { __wechatPlatformCerts?: PlatformCertCache };

/** AES-256-GCM 解密（APIv3 密钥；回包/平台证书共用同一套 AEAD 参数结构） */
export function decryptAead(encrypted: { ciphertext: string; nonce: string; associated_data?: string }, apiV3Key: string): Buffer | null {
  try {
    const buf = Buffer.from(encrypted.ciphertext, "base64");
    const authTag = buf.subarray(buf.length - 16);
    const data = buf.subarray(0, buf.length - 16);
    const decipher = crypto.createDecipheriv("aes-256-gcm", Buffer.from(apiV3Key, "utf-8"), Buffer.from(encrypted.nonce, "utf-8"));
    decipher.setAuthTag(authTag);
    if (encrypted.associated_data) decipher.setAAD(Buffer.from(encrypted.associated_data, "utf-8"));
    return Buffer.concat([decipher.update(data), decipher.final()]);
  } catch {
    return null;
  }
}

/** 拉取并缓存微信平台证书（用于回调验签；1 小时刷新） */
export async function loadPlatformCerts(force = false): Promise<Map<string, string> | null> {
  const cached = g.__wechatPlatformCerts;
  if (!force && cached && Date.now() - cached.fetchedAt < 60 * 60 * 1000 && cached.serials.size > 0) {
    return cached.serials;
  }
  const c = getWechatPayConfig();
  if (!isWechatPayConfigured()) return null;

  const urlPath = "/v3/certificates";
  const authorization = buildAuthorization("GET", urlPath, "");
  if (!authorization) return null;

  try {
    const res = await fetch(`${GATEWAY_BASE}${urlPath}`, {
      method: "GET",
      headers: { Accept: "application/json", Authorization: authorization, "User-Agent": "zhige-dockyard/1.0" },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: { serial_no: string; encrypt_certificate: { ciphertext: string; nonce: string; associated_data?: string } }[];
    };
    const serials = new Map<string, string>();
    for (const item of json.data || []) {
      const pemBuf = decryptAead(item.encrypt_certificate, c.apiV3Key);
      if (pemBuf) serials.set(item.serial_no, pemBuf.toString("utf-8"));
    }
    if (serials.size === 0) return null;
    g.__wechatPlatformCerts = { serials, fetchedAt: Date.now() };
    return serials;
  } catch {
    return null;
  }
}

export interface WechatNotifyVerifyResult {
  ok: boolean;
  error?: string;
  resource?: { out_trade_no: string; trade_state: string; transaction_id?: string; amount?: { total?: number } };
}

/**
 * 验证支付回调通知并解密资源。
 * 步骤：平台证书验签（timestamp\nnonce\nbody\n）→ AES-256-GCM 解密 resource → 返回业务明文。
 */
export async function verifyNotify(
  headers: { timestamp?: string; nonce?: string; signature?: string; serial?: string },
  rawBody: string,
): Promise<WechatNotifyVerifyResult> {
  const c = getWechatPayConfig();
  const { timestamp, nonce, signature, serial } = headers;
  if (!timestamp || !nonce || !signature || !serial) {
    return { ok: false, error: "回调缺少验签头" };
  }

  const certs = await loadPlatformCerts();
  const platformCert = certs?.get(serial);
  if (!platformCert) {
    // 序列号未命中缓存：强制刷新一次（平台证书轮换）
    const refreshed = await loadPlatformCerts(true);
    const retry = refreshed?.get(serial);
    if (!retry) return { ok: false, error: "平台证书校验失败（序列号未识别）" };
    certs?.set(serial, retry);
  }
  const pem = certs?.get(serial);
  if (!pem) return { ok: false, error: "平台证书不可用" };

  const message = `${timestamp}\n${nonce}\n${rawBody}\n`;
  const verifier = crypto.createVerify("RSA-SHA256");
  verifier.update(message);
  if (!verifier.verify(pem, signature, "base64")) {
    return { ok: false, error: "回调签名验证失败" };
  }

  let parsed: { resource?: { ciphertext: string; nonce: string; associated_data?: string } };
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { ok: false, error: "回调报文非 JSON" };
  }
  if (!parsed.resource) return { ok: false, error: "回调缺少 resource" };

  const plain = decryptAead(parsed.resource, c.apiV3Key);
  if (!plain) return { ok: false, error: "回调资源解密失败" };

  try {
    const resource = JSON.parse(plain.toString("utf-8")) as {
      out_trade_no?: string;
      trade_state?: string;
      transaction_id?: string;
      amount?: { total?: number };
    };
    if (!resource.out_trade_no || !resource.trade_state) {
      return { ok: false, error: "解密后报文缺少关键字段" };
    }
    return { ok: true, resource: resource as WechatNotifyVerifyResult["resource"] };
  } catch {
    return { ok: false, error: "解密后报文非 JSON" };
  }
}

/** 微信回调应答规范（验签失败返回 4xx 并带 code=FAIL，防止重放） */
export const NOTIFY_RESPONSE = {
  success: { code: "SUCCESS", message: "成功" } as const,
  fail: { code: "FAIL", message: "验签失败" } as const,
};
