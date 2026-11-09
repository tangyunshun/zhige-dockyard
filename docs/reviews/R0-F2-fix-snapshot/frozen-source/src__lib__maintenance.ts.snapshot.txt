/**
 * 系统维护模式（PRD G-02）
 *
 * 持久化到 DB（system_config 表）+ 内存缓存（60s TTL），
 * 确保多实例/重启后维护状态仍然生效，避免 PRD 原内存变量在重启后丢失的问题。
 */
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

const CACHE_TTL_MS = 60 * 1000;
let cache: { value: boolean; fetchedAt: number } | null = null;

export async function isMaintenanceMode(): Promise<boolean> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.value;
  }
  try {
    const row = await prisma.systemconfig.findUnique({ where: { key: "maintenance_mode" } });
    const value = row?.value === "true";
    cache = { value, fetchedAt: now };
    return value;
  } catch {
    return cache?.value ?? false;
  }
}

/** 同步读取（用于 validateUser 等高频路径，依赖最近一次缓存） */
export function isMaintenanceModeSync(): boolean {
  return cache?.value ?? false;
}

export async function setMaintenanceMode(enabled: boolean): Promise<void> {
  await prisma.systemconfig.upsert({
    where: { key: "maintenance_mode" },
    create: { key: "maintenance_mode", value: enabled ? "true" : "false" },
    update: { value: enabled ? "true" : "false" },
  });
  cache = { value: enabled, fetchedAt: Date.now() };
}

export async function getMaintenanceMessage(): Promise<string> {
  const row = await prisma.systemconfig.findUnique({ where: { key: "maintenance_message" } });
  return row?.value || "系统正在维护中，请稍后再试";
}

/**
 * 仅供维护配置写事务提交成功后调用：刷新内存缓存，使公开 GET 立即反映已提交状态。
 * 事务回滚时绝不调用，避免缓存显示一个未提交的维护状态。
 */
export function setMaintenanceCache(enabled: boolean): void {
  cache = { value: enabled, fetchedAt: Date.now() };
}

function genAuditId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

/**
 * [R0-F1] 审计事实：实际目标 + 最小必要 before/after。
 * 事实必须来自同一事务内的真实读取与写入结果（不能用客户端声明或过期缓存冒充旧值）；
 * 创建类操作记录实际生成的 ID；无变化时明确 changed=false，不虚构修改。
 * 只保存相关目标与必要字段，不记录 token、会话、密钥或整个系统配置。
 */
export interface MaintenanceAuditFact {
  /** 实际目标：配置键或计划/公告 ID；一次操作涉及多个目标时按序数组 */
  target: string | string[];
  /** 相关字段旧值（仅必要字段；创建类操作为 null） */
  before?: Record<string, unknown> | null;
  /** 相关字段新值（来自本次事务实际写入） */
  after?: Record<string, unknown> | null;
  /** 是否产生实际变化 */
  changed?: boolean;
  /** 其他必要事实（如实际写入的维护说明、清理会话数），不含 token/会话/密钥 */
  extra?: Record<string, unknown>;
}

/**
 * 在单一数据库事务内完成「维护配置写 + 操作审计」：
 * - writes 回调内的所有持久化必须使用传入的 tx，禁止逃逸到根 prisma 客户端；
 * - writes 返回审计事实（目标 + 最小实际 before/after），审计写与配置写同事务提交；
 * - 审计失败（或任一写入失败）则整体回滚，绝不留下无审计的成功变更。
 */
export async function withMaintenanceAudit(
  actorId: string,
  action: string,
  summary: any,
  writes: (tx: Prisma.TransactionClient) => Promise<MaintenanceAuditFact | void>,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const fact = (await writes(tx)) || null;
    const summaryObj =
      summary && typeof summary === "object" ? summary : summary != null ? { value: summary } : {};
    const details = {
      ...summaryObj,
      ...(fact
        ? {
            target: fact.target,
            before: fact.before ?? null,
            after: fact.after ?? null,
            ...(fact.changed !== undefined ? { changed: fact.changed } : {}),
            ...(fact.extra ?? {}),
          }
        : {}),
    };
    await tx.operationlog.create({
      data: {
        id: genAuditId(),
        userId: actorId,
        action,
        resource: action.split(":")[0] || "system",
        details,
        ipAddress: null,
      },
    });
  });
}

/**
 * [R0-F1] 事务内严格读取 JSON 数组配置（维护计划/发版记录）：
 * 行不存在按空数组处理（合法空态）；解析失败/非数组抛错 → 由调用方事务整体回滚，
 * 不编造空旧值继续写入并冒充可靠审计。filterIds 仅沿用既有假数据过滤规则（不新增清洗）。
 */
export async function readJsonArrayConfigTx(
  tx: Prisma.TransactionClient,
  key: string,
  filterIds?: Set<string>,
): Promise<any[]> {
  const row = await tx.systemconfig.findUnique({ where: { key } });
  const value = row?.value ?? null;
  if (value == null) return [];
  const parsed = JSON.parse(value); // 解析失败 → 抛出 → 事务回滚、请求诚实失败
  if (!Array.isArray(parsed)) throw new Error(`配置 ${key} 内容异常，已拒绝写入`);
  return filterIds ? parsed.filter((x: any) => !filterIds.has(x.id)) : parsed;
}

/**
 * 仅写入维护模式（落库，不更新内存缓存），供事务内使用。
 */
export async function setMaintenanceModeTx(
  tx: Prisma.TransactionClient,
  enabled: boolean,
): Promise<void> {
  await tx.systemconfig.upsert({
    where: { key: "maintenance_mode" },
    create: { key: "maintenance_mode", value: enabled ? "true" : "false" },
    update: { value: enabled ? "true" : "false" },
  });
}

/**
 * 供 check-maintenance 路由使用的同步检查
 * （从 maintenance/route.ts 移入：Next.js 路由文件只允许导出 HTTP handler）
 */
export async function isInMaintenance(): Promise<{ inMaintenance: boolean; message?: string }> {
  const inMaintenance = await isMaintenanceMode();
  if (!inMaintenance) return { inMaintenance: false };
  return { inMaintenance: true, message: await getMaintenanceMessage() };
}
