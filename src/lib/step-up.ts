import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";
import { randomBytes } from "crypto";

/**
 * E-04 Step-up 二次鉴权（高危操作前必须重新输入密码/验证）
 *
 * PRD 原意将二次鉴权令牌存 Redis（TTL 3 分钟），本仓库以 MySQL stepuptoken 表等价实现：
 * - issueStepUpToken：密码/验证通过后签发一次性令牌
 * - verifyStepUpToken：高危 API 校验令牌，通过即消费（单次有效），超时自动失效
 */

export const STEP_UP_TTL_MS = 3 * 60 * 1000; // PRD E-04：3 分钟

/**
 * 签发一次性 Step-up 令牌
 * @returns 明文令牌，仅本次下发给前端，数据库中只存哈希
 */
export async function issueStepUpToken(userId: string, operation: string): Promise<string> {
  // 清理该用户 + 该操作的过期令牌，避免表无限膨胀
  await prisma.stepuptoken.deleteMany({
    where: { userId, operation, expireAt: { lt: new Date() } },
  });

  const code = randomBytes(32).toString("hex");
  await prisma.stepuptoken.create({
    data: {
      userId,
      operation,
      code,
      expireAt: new Date(Date.now() + STEP_UP_TTL_MS),
    },
  });
  return code;
}

/**
 * 校验并消费一次 Step-up 令牌
 * 校验通过后立即删除记录，保证令牌仅可使用一次（RT 防重放同款语义）
 */
export async function verifyStepUpToken(
  userId: string,
  operation: string,
  code: string
): Promise<boolean> {
  if (!code) return false;

  const record = await prisma.stepuptoken.findFirst({
    where: { userId, operation, code, expireAt: { gt: new Date() } },
  });
  if (!record) return false;

  await prisma.stepuptoken.delete({ where: { id: record.id } });
  return true;
}

export interface StepUpCheckResult {
  ok: boolean;
  error?: string;
  status?: number;
}

/**
 * 高危 API 统一 Step-up 校验入口（@RequireStepUp 的 DB 等价实现）
 * @param request 当前请求
 * @param operation 高危操作类型，如 "delete_workspace" / "cancel_account"
 * @param userId 已由调用方完成身份鉴权后的用户 ID
 * @param options.verifyToken 调用方若已在解析 body 时拿到令牌可直接传入，
 *    避免对已消费的 request body 再次 clone 读取（clone 会因 stream disturbed 抛错）
 */
export async function requireStepUp(
  request: NextRequest,
  operation: string,
  userId: string,
  options?: { verifyToken?: string }
): Promise<StepUpCheckResult> {
  let verifyToken = options?.verifyToken || "";
  if (!verifyToken) {
    try {
      const body = await request.clone().json();
      verifyToken = body.verifyToken || "";
    } catch {
      // body 为空、非 JSON 或已被消费，视为未携带令牌
    }
  }

  if (!verifyToken) {
    return { ok: false, error: "SEC_AUTH_REQUIRED", status: 403 };
  }

  const ok = await verifyStepUpToken(userId, operation, verifyToken);
  if (!ok) {
    return { ok: false, error: "SEC_AUTH_INVALID", status: 403 };
  }
  return { ok: true };
}
