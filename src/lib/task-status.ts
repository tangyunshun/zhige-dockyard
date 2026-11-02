// 任务状态归一与筛选口径（唯一真源）：
// 任务中心（/tasks）与工作台任务页签必须共用同一套状态判定，禁止两处各写一套。

export type TaskStatus = "SUCCESS" | "RUNNING" | "FAILED" | "UNKNOWN";

/** 数据库中会被判为成功的原始状态值 */
export const SUCCESS_STATUSES = ["SUCCESS", "COMPLETED", "DONE", "SUCCEEDED"];
/** 数据库中会被判为失败的原始状态值（含取消/超时/驳回——均属非成功终态） */
export const FAILED_STATUSES = ["FAILED", "ERROR", "CANCELLED", "CANCELED", "TIMEOUT", "REJECTED"];
/** 数据库中会被判为进行中的原始状态值 */
export const RUNNING_STATUSES = ["RUNNING", "PENDING", "QUEUED", "PROCESSING", "READY", "IN_PROGRESS"];

/** 归一化：任意原始状态 → SUCCESS | RUNNING | FAILED | UNKNOWN */
export function normalizeTaskStatus(raw?: string | null): TaskStatus {
  const s = (raw || "").toUpperCase();
  if (SUCCESS_STATUSES.includes(s)) return "SUCCESS";
  if (FAILED_STATUSES.includes(s)) return "FAILED";
  if (RUNNING_STATUSES.includes(s)) return "RUNNING";
  return "UNKNOWN";
}

/** 服务端状态筛选：归一状态 → Prisma 查询条件（含历史小写变体兼容） */
export function statusFilterToPrisma(
  normalized: string,
): { in: string[] } | { not: { in: string[] } } | undefined {
  const upper = normalized.toUpperCase();
  if (upper === "SUCCESS") return { in: SUCCESS_STATUSES };
  if (upper === "FAILED") return { in: FAILED_STATUSES };
  if (upper === "RUNNING") return { in: RUNNING_STATUSES };
  if (upper === "UNKNOWN") {
    // 未知 = 不属于任何已知状态（含 ARCHIVED）
    return { not: { in: [...SUCCESS_STATUSES, ...FAILED_STATUSES, ...RUNNING_STATUSES, "ARCHIVED"] } };
  }
  return undefined;
}
