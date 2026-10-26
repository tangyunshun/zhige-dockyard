import crypto from "crypto";
import fs from "fs";

/**
 * 支付宝「电脑网站支付」（alipay.trade.page.pay）自包含实现——零第三方 SDK，node:crypto 完成 RSA2 签名与回调验签。
 *
 * 所需环境变量（与 isRealGatewayConfigured 契约一致）：
 *   ALIPAY_APP_ID             开放平台应用 APPID
 *   ALIPAY_PRIVATE_KEY_PATH   应用私钥 PEM（PKCS#8，RSA2）
 *   ALIPAY_PUBLIC_KEY_PATH    支付宝公钥 PEM（验签用）
 *   PAYMENT_NOTIFY_HOST       对外可达域名（异步通知 notify_url base）
 *
 * 语义约束：签名与跳转不产生入账；入账只发生在 /api/payments/notify/alipay 验签通过后。
 */

const GATEWAY = process.env.ALIPAY_GATEWAY || "https://openapi.alipay.com/gateway.do";

export function getAlipayConfig() {
  const appId = process.env.ALIPAY_APP_ID || "";
  const keyPath = process.env.ALIPAY_PRIVATE_KEY_PATH || "";
  const pubPath = process.env.ALIPAY_PUBLIC_KEY_PATH || "";
  let privateKey = "";
  let alipayPublicKey = "";
  try {
    if (keyPath) privateKey = fs.readFileSync(keyPath, "utf-8");
  } catch {
    privateKey = "";
  }
  try {
    if (pubPath) alipayPublicKey = fs.readFileSync(pubPath, "utf-8");
  } catch {
    alipayPublicKey = "";
  }
  return { appId, privateKey, alipayPublicKey };
}

export function isAlipayConfigured(): boolean {
  const c = getAlipayConfig();
  return !!(c.appId && c.privateKey && c.alipayPublicKey);
}

function pemKey(raw: string): string {
  // 兼容"裸 base64"配置：无头尾时补上标准 PEM 包装
  if (raw.includes("BEGIN")) return raw;
  const body = raw.replace(/\s+/g, "");
  const wrapped = body.replace(/(.{64})/g, "$1\n").trim();
  return `-----BEGIN PRIVATE KEY-----\n${wrapped}\n-----END PRIVATE KEY-----`;
}

function rsaSign(privateKeyPem: string, content: string): string {
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(content, "utf-8");
  return signer.sign(pemKey(privateKeyPem), "base64");
}

function rsaVerify(publicKeyPem: string, content: string, signature: string): boolean {
  try {
    // 支付宝公钥可能是裸 base64（需补 PEM 头尾）或标准 PUBLIC KEY 格式
    const pem = publicKeyPem.includes("BEGIN")
      ? publicKeyPem
      : `-----BEGIN PUBLIC KEY-----\n${publicKeyPem.replace(/\s+/g, "").replace(/(.{64})/g, "$1\n").trim()}\n-----END PUBLIC KEY-----`;
    const verifier = crypto.createVerify("RSA-SHA256");
    verifier.update(content, "utf-8");
    return verifier.verify(pem, signature, "base64");
  } catch {
    return false;
  }
}

/** 生成时间戳（yyyy-MM-dd HH:mm:ss） */
function alipayTimestamp(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * 构建支付宝收银台跳转 URL（GET 方式，携带 RSA2 签名）。
 * 用户浏览器跳转该 URL 即进入支付宝官方收银台。
 */
export function buildPagePayUrl(params: {
  orderNo: string;
  amountCents: number;
  subject: string;
  expiresAt?: Date | null;
  returnUrl?: string | null;
}): { ok: boolean; url?: string; error?: string } {
  const c = getAlipayConfig();
  if (!isAlipayConfigured()) {
    return { ok: false, error: "支付宝凭证未配置完整，拒绝下单" };
  }
  const notifyHost = (process.env.PAYMENT_NOTIFY_HOST || "").replace(/\/$/, "");
  if (!notifyHost) {
    return { ok: false, error: "PAYMENT_NOTIFY_HOST 未配置，无法接收支付回调，拒绝下单" };
  }

  const bizContent: Record<string, unknown> = {
    out_trade_no: params.orderNo,
    product_code: "FAST_INSTANT_TRADE_PAY",
    total_amount: (params.amountCents / 100).toFixed(2),
    subject: params.subject.slice(0, 60),
  };
  if (params.expiresAt) {
    // 支付宝超时关闭口径：15m 起；与订单本地 expiresAt 对齐（向上取整到分钟）
    const minutes = Math.max(1, Math.ceil((params.expiresAt.getTime() - Date.now()) / 60000));
    bizContent.timeout_express = `${minutes}m`;
  }

  const publicParams: Record<string, string> = {
    app_id: c.appId,
    method: "alipay.trade.page.pay",
    format: "JSON",
    charset: "utf-8",
    sign_type: "RSA2",
    timestamp: alipayTimestamp(),
    version: "1.0",
    notify_url: `${notifyHost}/api/payments/notify/alipay`,
    biz_content: JSON.stringify(bizContent),
  };
  if (params.returnUrl) publicParams.return_url = params.returnUrl;

  // 签名串：按 key 升序排列，k=v 用 & 连接（排除 sign / sign_type），值不做 URL 编码
  const signContent = Object.keys(publicParams)
    .sort()
    .map((k) => `${k}=${publicParams[k]}`)
    .join("&");
  const sign = rsaSign(c.privateKey, signContent);

  // 跳转 URL 的查询值需 URL 编码
  const query = Object.keys(publicParams)
    .sort()
    .map((k) => `${k}=${encodeURIComponent(publicParams[k])}`)
    .join("&");

  return { ok: true, url: `${GATEWAY}?${query}&sign=${encodeURIComponent(sign)}` };
}

export interface AlipayNotifyVerifyResult {
  ok: boolean;
  error?: string;
  outTradeNo?: string;
  tradeStatus?: string;
  totalAmount?: string;
}

/**
 * 验证支付宝异步通知（POST form-urlencoded）。
 * 规则：剔除 sign / sign_type 后按 key 升序拼 k=v& 串，用支付宝公钥 RSA2 验签；
 * 再校验 app_id、金额与订单匹配（金额核对由调用方执行）。
 */
export async function verifyNotify(form: Record<string, string>): Promise<AlipayNotifyVerifyResult> {
  const c = getAlipayConfig();
  const sign = form.sign;
  if (!sign) return { ok: false, error: "通知缺少签名" };
  if (form.app_id && form.app_id !== c.appId) {
    return { ok: false, error: "通知 app_id 与商户配置不符" };
  }

  const content = Object.keys(form)
    .filter((k) => k !== "sign" && k !== "sign_type" && form[k] !== undefined && form[k] !== "")
    .sort()
    .map((k) => `${k}=${form[k]}`)
    .join("&");

  if (!rsaVerify(c.alipayPublicKey, content, sign)) {
    return { ok: false, error: "通知签名验证失败" };
  }

  return {
    ok: true,
    outTradeNo: form.out_trade_no,
    tradeStatus: form.trade_status,
    totalAmount: form.total_amount,
  };
}
