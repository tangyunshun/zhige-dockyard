/**
 * 短信验证码存储（内存存储，模拟 Redis）
 * 生产环境请替换为 Redis 实现
 */

interface SmsCodeRecord {
  code: string;
  expiresAt: number; // 过期时间戳（毫秒）
  sentAt: number; // 发送时间戳
}

// 使用全局变量确保热重载时数据不丢失
const globalForSms = globalThis as unknown as {
  smsCodeStore: Map<string, SmsCodeRecord>;
};

// 内存存储 Map<phone, SmsCodeRecord>
const smsCodeStore = globalForSms.smsCodeStore || new Map<string, SmsCodeRecord>();

if (!globalForSms.smsCodeStore) {
  globalForSms.smsCodeStore = smsCodeStore;
}

// 验证码有效期：5 分钟
const CODE_EXPIRY_MS = 5 * 60 * 1000;

// 发送间隔（60 秒）
const SEND_INTERVAL_MS = 60 * 1000;

/**
 * 生成 6 位随机数字验证码
 */
export function generateSmsCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * 存储短信验证码
 */
export function storeSmsCode(phone: string, code: string): void {
  smsCodeStore.set(phone, {
    code,
    expiresAt: Date.now() + CODE_EXPIRY_MS,
    sentAt: Date.now(),
  });
}

/**
 * 验证短信验证码
 * @returns { valid: boolean, error?: string }
 */
export function verifySmsCode(phone: string, code: string): {
  valid: boolean;
  error?: string;
} {
  const record = smsCodeStore.get(phone);

  if (!record) {
    return { valid: false, error: "请先获取验证码" };
  }

  // 检查是否过期
  if (Date.now() > record.expiresAt) {
    smsCodeStore.delete(phone);
    return { valid: false, error: "验证码已过期" };
  }

  // 验证验证码
  if (record.code !== code) {
    return { valid: false, error: "验证码错误" };
  }

  // 验证成功，删除验证码（一次性使用）
  smsCodeStore.delete(phone);

  return { valid: true };
}

/**
 * 检查是否可以重新发送验证码
 * @returns { canResend: boolean, waitSeconds?: number }
 */
export function canResendSmsCode(phone: string): {
  canResend: boolean;
  waitSeconds?: number;
} {
  const record = smsCodeStore.get(phone);

  if (!record) {
    return { canResend: true };
  }

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
  for (const [phone, record] of smsCodeStore.entries()) {
    if (now > record.expiresAt) {
      smsCodeStore.delete(phone);
    }
  }
}

/**
 * 删除短信验证码（验证成功后调用）
 */
export function deleteSmsCode(phone: string): void {
  smsCodeStore.delete(phone);
}

// 每 5 分钟清理一次过期验证码
setInterval(cleanupExpiredCodes, 5 * 60 * 1000);
