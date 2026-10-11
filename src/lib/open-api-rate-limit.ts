/**
 * 开放接口（/api/open/v1/*）按 API Key 维度的限流
 *
 * 设计：
 *  - 复用既有开放接口「以 Key 识别调用方」的模型（authenticateApiKey 返回 keyId）；
 *  - 进程内滑动窗口（单实例有效，对齐 src/app/api/studio/extract-text/route.ts 的 Map 模式）；
 *  - 阈值从 systemconfig 读取（键 OPEN_API_RATE_LIMIT_PER_KEY_PER_MIN），缺省 30/分钟；
 *    如需多实例一致，可后续替换为 Redis/TurboPipe 等共享计数，接口保持不变。
 *
 * 注意：本模块只做频率计数，不写业务库；审计由调用方在鉴权/执行成功后自行记录。
 */
import { prisma } from "@/lib/prisma";

const WINDOW_MS = 60_000;
const DEFAULT_LIMIT_PER_MIN = 30;
const CONFIG_KEY = "OPEN_API_RATE_LIMIT_PER_KEY_PER_MIN";

// keyId -> 命中时间戳数组
const hits = new Map<string, number[]>();

async function getLimit(): Promise<number> {
  try {
    const row = await prisma.systemconfig.findUnique({ where: { key: CONFIG_KEY } });
    if (row?.value) {
      const n = Number(row.value);
      if (Number.isFinite(n) && n > 0) return Math.min(Math.max(Math.floor(n), 1), 10_000);
    }
  } catch {
    // 配置不可读时退回缺省，不影响主流程
  }
  return DEFAULT_LIMIT_PER_MIN;
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  limit: number;
  retryAfterSec: number;
}

export async function checkOpenApiRateLimit(keyId: string): Promise<RateLimitResult> {
  const limit = await getLimit();
  const now = Date.now();
  const arr = (hits.get(keyId) || []).filter((t) => now - t < WINDOW_MS);

  if (arr.length >= limit) {
    hits.set(keyId, arr);
    const oldest = arr[0];
    const retryAfterSec = Math.max(1, Math.ceil((WINDOW_MS - (now - oldest)) / 1000));
    return { ok: false, remaining: 0, limit, retryAfterSec };
  }

  arr.push(now);
  hits.set(keyId, arr);
  return { ok: true, remaining: limit - arr.length, limit, retryAfterSec: 0 };
}
