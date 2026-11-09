/**
 * 邮箱验证码存储与限流（F15 / B1 重构）
 *
 * 与 sms-store 对称：邮箱地址为唯一标识，走系统 SMTP 通道。
 * 不再使用本机 Map 或 Math.random：预算/签发/核验/消费走共享后端。
 * 真实委托未就绪时，send-email-code 在 sendMail 之前即获 503，不本机放行。
 *
 * 限流基线（见 VERIFY_POLICY）：发送间隔 60s、每邮箱日 10 次、失败 5 次锁 30 分钟；
 * 新增平台/IP 技术上限（保守，非现金预算）。
 */

import {
  storeVerificationCode,
  verifyVerificationCode,
  consumeVerificationCode,
  deleteVerificationCode,
  generateVerificationCode,
  type SendResult,
  type VerifyResult,
  type AdmitResult,
} from "./verification-codes";
import type { VerifyPurpose } from "./verification-backend";

/** 邮箱归一化：转小写并去除首尾空白 */
export function normalizeEmailKey(email: string): string {
  return (email || "").trim().toLowerCase();
}

/** 生成 6 位安全数字验证码（密码学随机） */
export function generateEmailCode(): string {
  return generateVerificationCode();
}

/**
 * 存储邮箱验证码（含共享预算裁决）。
 * @param type 用途：register / reset-password（默认 reset-password，向后兼容）
 */
export async function storeEmailCode(
  key: string,
  code: string,
  type?: VerifyPurpose,
): Promise<SendResult> {
  return storeVerificationCode("email", key, type ?? "reset-password", code);
}

/** 核验邮箱验证码（不消费）。 */
export async function verifyEmailCode(
  key: string,
  code: string,
  type?: VerifyPurpose,
): Promise<VerifyResult> {
  return verifyVerificationCode("email", key, type ?? "reset-password", code);
}

/** 一次性消费邮箱验证码（reset-password 等敏感接口在改密成功后调用）。 */
export async function consumeEmailCode(key: string, type?: VerifyPurpose): Promise<AdmitResult> {
  return consumeVerificationCode("email", key, type ?? "reset-password");
}

/** 删除邮箱验证码（注册成功后调用）。 */
export async function deleteEmailCode(key: string, type?: VerifyPurpose): Promise<void> {
  return deleteVerificationCode("email", key, type ?? "reset-password");
}

/** 过期清理：惰性过期，无需后台 timer。 */
export function cleanupExpiredEmailCodes(): void {
  /* no-op：共享后端按访问惰性过期 */
}
