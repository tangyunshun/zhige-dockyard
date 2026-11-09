/**
 * 验证码高层操作（F15 / B1）
 *
 * 组合 verification-backend：安全生成、哈希存储、核验、一次性消费。
 * SMS 与邮箱共用同一套共享后端，仅 channel 不同；purpose 隔离（注册/改密/登录/绑定互不通用）。
 */

import {
  getVerificationBackend,
  __setVerificationBackendForTest,
  __resetVerificationBackend,
  generateSecureCode,
  hashCode,
  newSalt,
  VERIFY_POLICY,
  newGrantId,
  VerificationBackendUnavailableError,
  type Channel,
  type VerifyPurpose,
  type AdmitResult,
} from "./verification-backend";

export type { AdmitResult } from "./verification-backend";
export { __setVerificationBackendForTest, __resetVerificationBackend, VERIFY_POLICY, newGrantId };

export interface SendResult {
  ok: boolean;
  error?: string;
  /** 建议 HTTP 状态码：未就绪 503、限流 429 */
  status?: number;
  waitSeconds?: number;
  /** [U02] 本次发送的稳定身份：结果回填（onSendResult）必须携带以实现幂等回退 */
  sendId?: string;
}

export interface VerifyResult {
  valid: boolean;
  error?: string;
  /** 已核验 challenge 的不可替换身份，供签发一次性授权凭证时绑定 */
  challengeId?: string;
  /** [U02] 验证服务不可用（fail-closed）：调用方应返回 503，不计入用户失败 */
  notReady?: boolean;
}

function normalize(target: string): string {
  return (target || "").trim().toLowerCase();
}

/** 生成 6 位安全数字验证码（替代 Math.random） */
export function generateVerificationCode(): string {
  return generateSecureCode();
}

/**
 * 存储验证码：先裁决共享预算（admitSend，含发送预约身份绑定），再签发哈希。
 * 预算未就绪（真实委托不可用）时返回 status=503，不发生任何外部发送。
 * @param opts.ip 仅取自服务端可信来源（代理规范化后），绝不信任 body 任意字符串
 * @param opts.actorId 已认证账号（如存在）
 */
export async function storeVerificationCode(
  channel: Channel,
  target: string,
  purpose: VerifyPurpose,
  code: string,
  opts: { ip?: string; actorId?: string | null } = {},
): Promise<SendResult> {
  const t = normalize(target);
  const backend = getVerificationBackend();

  const admit = await backend.admitSend({ channel, target: t, purpose, ip: opts.ip, actorId: opts.actorId ?? null });
  if (!admit.ok) {
    return { ok: false, error: admit.error, status: admit.status, waitSeconds: admit.waitSeconds };
  }

  const salt = newSalt();
  const combined = `${salt}:${hashCode(code, salt)}`;
  const issue = await backend.issue({
    channel,
    target: t,
    purpose,
    codeHash: combined,
    expiresAt: Date.now() + VERIFY_POLICY.codeExpiryMs,
  });
  if (!issue.ok) {
    // [U02] 签发失败按预约身份幂等返还本次占用（重复回填零效果）
    await backend.onSendResult({ channel, target: t, purpose }, "failed", admit.sendId);
    return { ok: false, error: issue.error, status: issue.status };
  }
  return { ok: true, sendId: admit.sendId };
}

/**
 * 核验验证码（不消费）：比对哈希、有效期、失败锁定。失败时累计失败次数。
 * [U02 §2.1.3] 锁服务不可用 → fail-closed（notReady=true，不计用户失败、不返回有效）。
 */
export async function verifyVerificationCode(
  channel: Channel,
  target: string,
  purpose: VerifyPurpose,
  code: string,
): Promise<VerifyResult> {
  const t = normalize(target);
  const backend = getVerificationBackend();
  let rec: Awaited<ReturnType<typeof backend.lookup>>;
  try {
    rec = await backend.lookup({ channel, target: t, purpose });
  } catch (e) {
    if (e instanceof VerificationBackendUnavailableError) {
      return { valid: false, error: "验证服务暂不可用，请稍后重试", notReady: true };
    }
    throw e;
  }
  if (!rec) {
    await backend.recordFailure({ channel, target: t, purpose });
    return { valid: false, error: "请先获取验证码" };
  }
  const sep = rec.codeHash.indexOf(":");
  const salt = sep >= 0 ? rec.codeHash.slice(0, sep) : "";
  const hash = sep >= 0 ? rec.codeHash.slice(sep + 1) : rec.codeHash;
  if (!salt || hashCode(code, salt) !== hash) {
    await backend.recordFailure({ channel, target: t, purpose });
    return { valid: false, error: "验证码错误" };
  }
  return { valid: true, challengeId: rec.challengeId };
}

/**
 * 一次性消费：原子标记已用，两个实例并发不可重复消费。
 * 传入 challengeId 时，只有当前有效码与签发凭证绑定的那一枚一致才允许消费
 * （旧凭证不能消费后来签发的新码）。
 */
export async function consumeVerificationCode(
  channel: Channel,
  target: string,
  purpose: VerifyPurpose,
  challengeId?: string,
): Promise<AdmitResult> {
  return getVerificationBackend().consume({ channel, target: normalize(target), purpose, challengeId });
}

/** 删除有效验证码（注册成功后调用）。 */
export async function deleteVerificationCode(
  channel: Channel,
  target: string,
  purpose: VerifyPurpose,
): Promise<void> {
  return getVerificationBackend().delete({ channel, target: normalize(target), purpose });
}
