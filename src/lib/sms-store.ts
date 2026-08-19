﻿/**
 * 短信/邮箱验证码存储与限流（P1-1 增强）
 *
 * 当前为内存 Map 实现（适配单实例部署与开发环境）。
 * 生产环境多实例部署时，应替换为 Redis 实现（保留同名 API 即可）。
 *
 * 限流能力：
 * - 发送间隔：60 秒
 * - 每日发送上限：10 次/号码
 * - 验证失败累计：5 次后锁定该号码 30 分钟
 */

interface SmsCodeRecord {
  code: string;
  expiresAt: number; // 过期时间戳（毫秒）
  sentAt: number; // 发送时间戳
  /** 当日已发送次数，按 0-24h 滚动窗口统计 */
  dailyCount: number;
  /** 当日窗口起点 */
  windowStart: number;
}

interface FailRecord {
  count: number;
  lockedUntil: number;
}

// 使用全局变量确保热重载时数据不丢失
const globalForSms = globalThis as unknown as {
  smsCodeStore: Map<string, SmsCodeRecord>;
  smsFailStore: Map<string, FailRecord>;
};

const smsCodeStore: Map<string, SmsCodeRecord> =
  globalForSms.smsCodeStore || new Map();
const smsFailStore: Map<string, FailRecord> =
  globalForSms.smsFailStore || new Map();

if (!globalForSms.smsCodeStore) globalForSms.smsCodeStore = smsCodeStore;
if (!globalForSms.smsFailStore) globalForSms.smsFailStore = smsFailStore;

// 验证码有效期：5 分钟
const CODE_EXPIRY_MS = 5 * 60 * 1000;

// 发送间隔（60 秒）
const SEND_INTERVAL_MS = 60 * 1000;

// 每日发送上限
const DAILY_LIMIT = 10;

// 24 小时滚动窗口
const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;

// 验证失败上限：5 次后锁定
const FAIL_LIMIT = 5;

// 验证失败锁定时长：30 分钟
const FAIL_LOCK_MS = 30 * 60 * 1000;

export interface SendResult {
  ok: boolean;
  error?: string;
  waitSeconds?: number;
}

export interface VerifyResult {
  valid: boolean;
  error?: string;
}

/**
 * 生成 6 位随机数字验证码
 */
export function generateSmsCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * 检查是否被验证失败锁定
 */
function isLocked(key: string): boolean {
  const r = smsFailStore.get(key);
  if (!r) return false;
  if (Date.now() > r.lockedUntil) {
    smsFailStore.delete(key);
    return false;
  }
  return true;
}

/**
 * 记录一次验证失败
 */
function recordFail(key: string): void {
  const r = smsFailStore.get(key) || { count: 0, lockedUntil: 0 };
  r.count += 1;
  if (r.count >= FAIL_LIMIT) {
    r.lockedUntil = Date.now() + FAIL_LOCK_MS;
    r.count = 0;
  }
  smsFailStore.set(key, r);
}

/**
 * 存储短信验证码
 * 包含发送频率与每日上限限流
 */
export function storeSmsCode(key: string, code: string): SendResult {
  // 被锁定则拒绝
  if (isLocked(key)) {
    return { ok: false, error: "验证码错误次数过多，请稍后再试" };
  }

  const now = Date.now();
  const existing = smsCodeStore.get(key);

  // 发送间隔限流
  if (existing && now - existing.sentAt < SEND_INTERVAL_MS) {
    const waitSeconds = Math.ceil(
      (SEND_INTERVAL_MS - (now - existing.sentAt)) / 1000
    );
    return { ok: false, error: `请${waitSeconds}秒后再试`, waitSeconds };
  }

  // 每日上限：滚动窗口
  let windowStart = existing?.windowStart ?? now;
  let dailyCount = existing?.dailyCount ?? 0;
  if (now - windowStart > DAILY_WINDOW_MS) {
    windowStart = now;
    dailyCount = 0;
  }
  dailyCount += 1;
  if (dailyCount > DAILY_LIMIT) {
    return { ok: false, error: "今日发送次数已达上限，请明日再试" };
  }

  smsCodeStore.set(key, {
    code,
    expiresAt: now + CODE_EXPIRY_MS,
    sentAt: now,
    dailyCount,
    windowStart,
  });

  return { ok: true };
}

/**
 * 验证短信验证码（不消费，仅校验是否正确）
 * 失败会累计失败次数，达到上限锁定 30 分钟
 */
export function verifySmsCode(key: string, code: string): VerifyResult {
  if (isLocked(key)) {
    return { valid: false, error: "验证码错误次数过多，请稍后再试" };
  }

  const record = smsCodeStore.get(key);

  if (!record) {
    recordFail(key);
    return { valid: false, error: "请先获取验证码" };
  }

  if (Date.now() > record.expiresAt) {
    smsCodeStore.delete(key);
    recordFail(key);
    return { valid: false, error: "验证码已过期" };
  }

  if (record.code !== code) {
    recordFail(key);
    return { valid: false, error: "验证码错误" };
  }

  return { valid: true };
}

/**
 * 消费验证码（一次性使用，供 reset-password 等敏感接口在改密成功后调用）
 */
export function consumeSmsCode(key: string): void {
  smsCodeStore.delete(key);
  smsFailStore.delete(key);
}

/**
 * 检查是否可以重新发送验证码
 */
export function canResendSmsCode(key: string): {
  canResend: boolean;
  waitSeconds?: number;
} {
  if (isLocked(key)) {
    return { canResend: false };
  }
  const record = smsCodeStore.get(key);
  if (!record) return { canResend: true };

  const timeSinceSent = Date.now() - record.sentAt;
  if (timeSinceSent < SEND_INTERVAL_MS) {
    const waitSeconds = Math.ceil((SEND_INTERVAL_MS - timeSinceSent) / 1000);
    return { canResend: false, waitSeconds };
  }

  return { canResend: true };
}

/**
 * 清除过期的验证码（定期清理）
 */
export function cleanupExpiredCodes(): void {
  const now = Date.now();
  for (const [key, record] of smsCodeStore.entries()) {
    if (now > record.expiresAt) {
      smsCodeStore.delete(key);
    }
  }
  // 清理过期的失败锁定
  for (const [key, record] of smsFailStore.entries()) {
    if (record.lockedUntil && now > record.lockedUntil) {
      smsFailStore.delete(key);
    }
  }
}

/**
 * 删除短信验证码（验证成功后调用）
 */
export function deleteSmsCode(key: string): void {
  smsCodeStore.delete(key);
  smsFailStore.delete(key);
}

// 每 5 分钟清理一次过期验证码
setInterval(cleanupExpiredCodes, 5 * 60 * 1000);
