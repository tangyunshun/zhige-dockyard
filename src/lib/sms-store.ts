/**
 * 短信验证码存储（内存存储，模拟 Redis）
 * 生产环境请替换为 Redis 实现
 */

interface SmsCodeRecord {
  code: string;
  expiresAt: number; // 过期时间戳（毫秒）
  sentAt: number; // 发送时间戳
}

// 内存存储 Map<phone, SmsCodeRecord>
const smsCodeStore = new Map<string, SmsCodeRecord>();

// 验证码有效期（5 分钟）
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
 * 存储验证码
 */
export function storeSmsCode(
  phone: string,
  code: string
): { success: boolean; message?: string; countdown?: number } {
  const now = Date.now();

  // 检查是否还在发送间隔内
  const existingRecord = smsCodeStore.get(phone);
  if (existingRecord) {
    const timeSinceLastSend = now - existingRecord.sentAt;
    if (timeSinceLastSend < SEND_INTERVAL_MS) {
      const countdown = Math.ceil((SEND_INTERVAL_MS - timeSinceLastSend) / 1000);
      return {
        success: false,
        message: `验证码已发送，请${countdown}秒后再试`,
        countdown,
      };
    }
  }

  // 存储新验证码
  smsCodeStore.set(phone, {
    code,
    expiresAt: now + CODE_EXPIRY_MS,
    sentAt: now,
  });

  return { success: true };
}

/**
 * 验证验证码
 */
export function verifySmsCode(
  phone: string,
  code: string
): {
  success: boolean;
  message?: string;
} {
  const record = smsCodeStore.get(phone);
  const now = Date.now();

  // 检查是否存在验证码记录
  if (!record) {
    return {
      success: false,
      message: "请先获取验证码",
    };
  }

  // 检查是否已过期
  if (now > record.expiresAt) {
    smsCodeStore.delete(phone);
    return {
      success: false,
      message: "验证码已过期，请重新获取",
    };
  }

  // 验证验证码
  if (code !== record.code) {
    return {
      success: false,
      message: "验证码错误，请重新输入！",
    };
  }

  // 验证成功，删除验证码
  smsCodeStore.delete(phone);

  return {
    success: true,
  };
}

/**
 * 删除验证码（验证成功后调用）
 */
export function deleteSmsCode(phone: string): void {
  smsCodeStore.delete(phone);
}

/**
 * 清理过期的验证码（定期调用）
 */
export function cleanupExpiredCodes(): void {
  const now = Date.now();
  for (const [phone, record] of smsCodeStore.entries()) {
    if (now > record.expiresAt) {
      smsCodeStore.delete(phone);
    }
  }
}

// 每分钟清理一次过期验证码
if (typeof global !== "undefined") {
  setInterval(cleanupExpiredCodes, 60 * 1000);
}
