/**
 * 安装向导的短期一次性授权（U05-4 / 原 9）。
 *
 * 沿用已批准的 SETUP_TOKEN 安装体系，不新增第二份静态秘密：
 * - verify-setup-token 校验 SETUP_TOKEN 且确认空库后，用 SETUP_TOKEN 派生 HMAC 密钥
 *   签发一个绑定「创建初始管理员」用途、带随机 nonce、短有效期的授权串；
 * - init-admin 校验签名/用途/有效期，并在「空库检查 + 唯一认领 + 用户创建」同一事务内消费；
 * - 授权的一次性由「系统只能初始化一次」的持久事实承载：认领键与用户行提交后，
 *   重放同一授权必然因非空库/唯一键冲突被拒，无法二次创建。
 */
import crypto from "crypto";

const PURPOSE = "INIT_ADMIN_CREATE";
const TTL_MS = 10 * 60 * 1000;

function secret(): string | null {
  const s = process.env.SETUP_TOKEN;
  return s && s.trim() ? s.trim() : null;
}

function sign(body: string, key: string): string {
  return crypto.createHmac("sha256", key).update(body).digest("base64url");
}

export interface InstallGrant {
  token: string;
  expiresAt: number;
}

/** 签发：仅在调用方已自行校验 SETUP_TOKEN 且确认为空库后调用 */
export function issueInstallGrant(now = Date.now()): InstallGrant | null {
  const key = secret();
  if (!key) return null;
  const expiresAt = now + TTL_MS;
  const payload = {
    purpose: PURPOSE,
    nonce: crypto.randomBytes(16).toString("hex"),
    iat: now,
    exp: expiresAt,
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return { token: `${body}.${sign(body, key)}`, expiresAt };
}

/** 校验：签名、用途、有效期、签发时间；不检查一次性（一次性由创建端事务认领保证） */
export function verifyInstallGrant(token: unknown, now = Date.now()): { ok: boolean; error?: string } {
  const key = secret();
  if (!key) return { ok: false, error: "服务器未配置安装授权体系，无法创建初始管理员" };
  if (typeof token !== "string" || !token.includes(".")) {
    return { ok: false, error: "缺少或无效的安装授权，请先验证安装令牌" };
  }
  const [body, sig] = token.split(".");
  if (!body || !sig) return { ok: false, error: "缺少或无效的安装授权，请先验证安装令牌" };
  const expected = sign(body, key);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, error: "安装授权无效，请重新验证安装令牌" };
  }
  let payload: any;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { ok: false, error: "安装授权无效，请重新验证安装令牌" };
  }
  if (payload?.purpose !== PURPOSE) {
    return { ok: false, error: "安装授权用途不符，拒绝创建管理员" };
  }
  if (!Number.isFinite(payload.exp) || payload.exp <= now) {
    return { ok: false, error: "安装授权已过期，请重新验证安装令牌" };
  }
  if (!Number.isFinite(payload.iat) || payload.iat > now + 60_000) {
    return { ok: false, error: "安装授权无效，请重新验证安装令牌" };
  }
  return { ok: true };
}
