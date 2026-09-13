import { NextRequest } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

/**
 * 开放接口 API Key 鉴权
 *
 * 修复此前「API Key 生成后无任何接口可用」的业务逻辑断点：
 * 开发者中心生成的 Key 现在可用于调用 /api/open/v1/* 下的开放接口。
 *
 * 鉴权流程：
 *  1. 从 Authorization: Bearer <key> 或 x-api-key 头中提取明文 Key；
 *  2. 按 Key 的可识别前缀（前 11 位，形如 sk-xxxxxxxx）检索候选记录；
 *  3. 使用 bcrypt 与库中 keyHash 逐条比对，命中即认证通过；
 *  4. 记录 lastUsedAt 并写入 APIKey:Use 审计日志，供开发者中心统计调用量。
 */

export interface ApiKeyAuthResult {
  userId: string;
  keyId: string;
  keyName: string;
}

function extractKey(request: NextRequest): string | null {
  const authHeader = request.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    // 仅接受形如 sk- 的明文 API Key，避免与 JWT 会话凭证混淆
    if (token) return token;
  }
  const headerKey = request.headers.get("x-api-key");
  return headerKey ? headerKey.trim() : null;
}

export async function authenticateApiKey(
  request: NextRequest,
): Promise<ApiKeyAuthResult | null> {
  const presented = extractKey(request);
  if (!presented) return null;

  // 精确前缀优先；兼容历史数据（旧记录前缀恒为 "sk-"）
  const prefixes = Array.from(
    new Set([presented.slice(0, 11), presented.slice(0, 3)].filter(Boolean)),
  );

  let candidates: any[] = [];
  for (const prefix of prefixes) {
    const rows = await prisma.apikey.findMany({ where: { keyPrefix: prefix } });
    if (rows.length > 0) {
      candidates = candidates.concat(rows);
      break;
    }
  }

  if (candidates.length === 0) return null;

  for (const candidate of candidates) {
    let matched = false;
    try {
      matched = await bcrypt.compare(presented, candidate.keyHash);
    } catch {
      matched = false;
    }
    if (!matched) continue;

    // 记录使用痕迹（尽力而为，不影响主流程）
    await prisma.apikey
      .update({ where: { id: candidate.id }, data: { lastUsedAt: new Date() } })
      .catch(() => {});
    await prisma.operationlog
      .create({
        data: {
          id: crypto.randomUUID(),
          userId: candidate.userId,
          action: "APIKey:Use",
          resource: "APIKey",
          details: {
            keyId: candidate.id,
            keyName: candidate.name,
            path: request.nextUrl.pathname,
          },
          ipAddress:
            request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
            request.headers.get("x-real-ip") ||
            "unknown",
          createdAt: new Date(),
        },
      })
      .catch(() => {});

    return {
      userId: candidate.userId,
      keyId: candidate.id,
      keyName: candidate.name,
    };
  }

  return null;
}
