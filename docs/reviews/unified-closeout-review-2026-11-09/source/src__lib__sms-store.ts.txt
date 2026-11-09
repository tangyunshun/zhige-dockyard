﻿/**
 * 短信验证码存储与限流（F15 / B1 重构）
 *
 * 不再使用本机 Map 或 Math.random：发送前预算、签发、核验、消费全部走共享后端
 * （verification-codes + verification-backend），多实例共用同一份限制。
 * 真实委托（MySQL/Prisma 表）未就绪时，业务在发送前即获 503，不本机放行。
 *
 * 限流基线（集中说明，见 VERIFY_POLICY）：发送间隔 60s、每目标日 10 次、
 * 失败 5 次锁 30 分钟；新增平台/IP 技术上限（保守，非现金预算）。
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

/** 生成 6 位安全数字验证码（密码学随机） */
export function generateSmsCode(): string {
  return generateVerificationCode();
}

/**
 * 存储短信验证码（含共享预算裁决）。
 * @param type 用途：register / reset-password / login / binding（默认 reset-password，向后兼容）
 */
export async function storeSmsCode(
  key: string,
  code: string,
  type?: VerifyPurpose,
): Promise<SendResult> {
  return storeVerificationCode("sms", key, type ?? "reset-password", code);
}

/** 核验短信验证码（不消费）。 */
export async function verifySmsCode(
  key: string,
  code: string,
  type?: VerifyPurpose,
): Promise<VerifyResult> {
  return verifyVerificationCode("sms", key, type ?? "reset-password", code);
}

/** 一次性消费短信验证码。 */
export async function consumeSmsCode(key: string, type?: VerifyPurpose, challengeId?: string): Promise<AdmitResult> {
  return consumeVerificationCode("sms", key, type ?? "reset-password", challengeId);
}

/** 删除短信验证码（注册/绑定成功后调用）。 */
export async function deleteSmsCode(key: string, type?: VerifyPurpose): Promise<void> {
  return deleteVerificationCode("sms", key, type ?? "reset-password");
}

/**
 * 是否可重发（轻量封装）。实际发送间隔/日限由共享后端在 storeSmsCode 时统一裁决，
 * 这里仅作前端提示参考，不再维护本机状态。
 */
export async function canResendSmsCode(
  key: string,
  type?: VerifyPurpose,
): Promise<{ canResend: boolean; waitSeconds?: number }> {
  void key;
  void type;
  return { canResend: true };
}

/** 过期清理：核验/查找均为惰性过期（lookup 仅返回有效码），无需后台 timer。 */
export function cleanupExpiredCodes(): void {
  /* no-op：共享后端按访问惰性过期 */
}
