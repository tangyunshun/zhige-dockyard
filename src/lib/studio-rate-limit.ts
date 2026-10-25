/**
 * 组件执行（/api/studio）限流与熔断隔离。
 *
 * 背景（定价审核发现的亏损漏洞）：
 * 固定包干制下「执行 → 失败/熔断 → 全额退款」意味着供应商成本已发生但平台收入为零。
 * 若无频率限制，恶意用户可用脚本循环触发，稳定掏空平台模型额度。
 *
 * 设计（对齐 src/lib/open-api-rate-limit.ts 的既有模式）：
 *  - 进程内滑动窗口计数（单实例部署有效；多实例需共享计数时可平滑替换，接口不变）；
 *  - 阈值从 systemconfig 读取，缺省值即下方 DEFAULT_*，不写业务库；
 *  - 两道防线：
 *    1) 频率限制：每用户每组件 N 次/分钟（默认 10）；
 *    2) 熔断隔离：同一用户 1 小时内触发 Token 熔断 ≥3 次 → 暂停执行 1 小时（默认）。
 */
import { prisma } from "@/lib/prisma";

const WINDOW_MS = 60_000; // 频率窗口：1 分钟
const BREAK_WINDOW_MS = 60 * 60 * 1000; // 熔断统计窗口：1 小时

const KEY_RATE = "STUDIO_EXEC_RATE_LIMIT_PER_MIN";
const KEY_BREAK_MAX = "STUDIO_CIRCUIT_BREAK_MAX_PER_HOUR";
const KEY_SUSPEND_MIN = "STUDIO_CIRCUIT_BREAK_SUSPEND_MINUTES";

const DEFAULT_RATE = 10;
const DEFAULT_BREAK_MAX = 3;
const DEFAULT_SUSPEND_MIN = 60;

/** userId::componentId -> 命中时间戳数组 */
const hits = new Map<string, number[]>();
/** userId -> 熔断触发时间戳数组（1 小时窗口） */
const breaks = new Map<string, number[]>();
/** userId -> 暂停截止时间戳（ms） */
const suspensions = new Map<string, number>();

async function readCfg(key: string, def: number, min: number, max: number): Promise<number> {
  try {
    const row = await prisma.systemconfig.findUnique({ where: { key } });
    if (row?.value != null) {
      const n = Number(row.value);
      if (Number.isFinite(n) && n > 0) return Math.min(Math.max(Math.floor(n), min), max);
    }
  } catch {
    // 配置不可读时退回缺省，不影响主流程
  }
  return def;
}

export type StudioExecutionGateResult =
  | { ok: true }
  | { ok: false; code: string; error: string; retryAfterSec: number };

/**
 * 执行前门禁：熔断隔离 + 每用户每组件频率限制。
 * 通过时才放行进入扣费/模型调用；被拦截时不扣点、不调模型。
 */
export async function checkStudioExecutionAllowed(
  userId: string,
  componentId: string,
): Promise<StudioExecutionGateResult> {
  const now = Date.now();

  // 1) 熔断隔离：暂停期内一律拒绝
  const until = suspensions.get(userId);
  if (until && until > now) {
    return {
      ok: false,
      code: "EXECUTION_SUSPENDED",
      error: `检测到异常执行行为，账号已被临时限制执行，请 ${Math.ceil((until - now) / 60000)} 分钟后再试。如属误判请联系平台管理员。`,
      retryAfterSec: Math.ceil((until - now) / 1000),
    };
  }

  // 2) 频率限制：每用户每组件滑动窗口
  const limit = await readCfg(KEY_RATE, DEFAULT_RATE, 1, 10_000);
  const key = `${userId}::${componentId}`;
  const arr = (hits.get(key) || []).filter((t) => now - t < WINDOW_MS);
  if (arr.length >= limit) {
    hits.set(key, arr);
    const oldest = arr[0];
    return {
      ok: false,
      code: "EXECUTION_RATE_LIMITED",
      error: `执行太频繁了：同一组件每分钟最多执行 ${limit} 次，请 ${Math.max(1, Math.ceil((WINDOW_MS - (now - oldest)) / 1000))} 秒后再试。`,
      retryAfterSec: Math.max(1, Math.ceil((WINDOW_MS - (now - oldest)) / 1000)),
    };
  }
  arr.push(now);
  hits.set(key, arr);
  return { ok: true };
}

/**
 * 记录一次 Token 熔断（执行后「实际用量超预估 3 倍」被拦截时调用）。
 * 同一用户 1 小时内累计达到阈值即自动暂停执行，堵住「退款刷量」路径。
 */
export async function recordStudioCircuitBreak(userId: string): Promise<void> {
  const now = Date.now();
  const max = await readCfg(KEY_BREAK_MAX, DEFAULT_BREAK_MAX, 1, 1000);
  const suspendMin = await readCfg(KEY_SUSPEND_MIN, DEFAULT_SUSPEND_MIN, 1, 1440);

  const arr = (breaks.get(userId) || []).filter((t) => now - t < BREAK_WINDOW_MS);
  arr.push(now);
  breaks.set(userId, arr);

  if (arr.length >= max) {
    suspensions.set(userId, now + suspendMin * 60_000);
    breaks.delete(userId);
    console.warn(
      `[执行熔断隔离] 用户 ${userId} 1 小时内触发 ${arr.length} 次 Token 熔断，已暂停执行 ${suspendMin} 分钟`,
    );
  }
}

/**
 * 测试专用：清空限流/熔断的内存计数（仅测试进程内使用）。
 * 测试在 1 分钟内会高频执行同组件，会正常触发频率限制——
 * 每个用例前重置，保证用例之间互不污染。
 */
export function __resetStudioRateLimitForTests(): void {
  hits.clear();
  breaks.clear();
  suspensions.clear();
}
