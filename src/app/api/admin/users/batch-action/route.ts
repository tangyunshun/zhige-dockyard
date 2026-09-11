import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requirePlatformPermission,
  writeAuditLog,
  normalizePlatformRole,
} from "@/lib/security";
import { assertCSRF } from "@/lib/csrf";
import { executeAdminUserDeletion, analyzeUserDeletion } from "@/lib/admin-user-deletion";

/**
 * 统一批量用户管理端点（封禁 / 解封 / 强制下线 / 删除）
 *
 * 设计要点（对齐 PRD）：
 * - 权限红线：仅 ADMIN / OWNER（平台管理员）可调用，且按动作要求对应权限；
 *   管理员不能操作其他管理员/超管；任何人都不能操作自己；OWNER 不可被选中。
 * - 不同动作按规则自动过滤目标，其余自动跳过（绝不无脑执行同一动作）。
 * - 批量 ID 列表分批处理，每批 ≤ 100，禁止循环单条更新（统一 updateMany / deleteMany）。
 * - 封禁/踢人后精确清除会话：清空 user 表会话字段，并按 userId 精确删除 userdevice 设备索引
 *   （本仓库无 Redis，会话语义等价落地在数据库；禁止模糊匹配）。
 * - 所有批量操作均写入审计日志（operationlog）。
 * - 幂等：动作 where 条件已带状态判定，重复提交不会重复生效。
 * - 支持跨页全选：调用方可传 filters（当前筛选条件）而非数百个 ID，后端按筛选条件取数。
 */

type ActionType = "ban" | "unban" | "kick" | "delete";

const ACTION_PERMISSION: Record<ActionType, string> = {
  ban: "user:ban",
  unban: "user:update",
  kick: "user:reset_session",
  delete: "user:delete",
};

/** 单批处理上限（与 PRD 一致：每批不超过 100 个） */
const MAX_CHUNK = 100;

interface CandidateUser {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  status: string;
  bannedUntil: Date | string | null;
  lastForcedLogoutAt: Date | string | null;
  sessionToken: string | null;
  sessionExpiresAt: Date | string | null;
  lastActivityAt: Date | string | null;
  lastLoginAt: Date | string | null;
}

interface Filters {
  search?: string;
  role?: string;
  accountStatus?: string;
  membershipLevel?: string;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/** 平台角色是否为特权角色（管理员 / 超级管理员），此类账号不可被批量操作 */
function isPrivileged(role: string): boolean {
  const r = normalizePlatformRole(role);
  return r === "SUPER_ADMIN" || r === "PLATFORM_ADMIN";
}

/** 是否存在有效会话：sessionToken 未清空且会话未过期（与 10 分钟活跃度无关） */
function hasValidSession(u: CandidateUser, now: number): boolean {
  if (u.status !== "active") return false;
  if (!u.sessionToken || !u.sessionExpiresAt) return false;
  return new Date(u.sessionExpiresAt).getTime() > now;
}

/** 根据动作类型，将候选用户分类为「可执行」或「跳过」，并给出跳过原因 */
function classify(
  action: ActionType,
  u: CandidateUser,
  now: number
): { processable: boolean; reason?: string } {
  switch (action) {
    case "ban":
      if (u.status === "banned") return { processable: false, reason: "该用户已被封禁" };
      if (u.status !== "active")
        return { processable: false, reason: "该用户状态不是启用中" };
      return { processable: true };
    case "unban":
      if (u.status !== "banned") return { processable: false, reason: "该用户未被封禁" };
      return { processable: true };
    case "kick":
      if (!hasValidSession(u, now))
        return { processable: false, reason: "该用户当前无有效会话，无需下线" };
      return { processable: true };
    case "delete":
      // 候选用户已在调用方排除特权角色与操作者本人，普通用户均可删除
      return { processable: true };
    default:
      return { processable: false, reason: "未知操作" };
  }
}

/** 由前端筛选条件构造与 GET /api/admin/users 一致的 where（不含 loginStatus，因其为派生状态） */
function buildFilterWhere(filters: Filters): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search } },
      { email: { contains: filters.search } },
      { phone: { contains: filters.search } },
    ];
  }
  if (filters.role) where.role = filters.role;
  if (filters.accountStatus) where.status = filters.accountStatus;
  if (filters.membershipLevel) where.membershipLevel = filters.membershipLevel;
  return where;
}

const CANDIDATE_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  bannedUntil: true,
  lastForcedLogoutAt: true,
  sessionToken: true,
  sessionExpiresAt: true,
  lastActivityAt: true,
  lastLoginAt: true,
} as const;

/** 跨页全选：按 where 分页拉取候选用户（避免一次性巨量查询占满内存） */
async function fetchCandidatesByFilter(
  where: Record<string, unknown>
): Promise<CandidateUser[]> {
  const all: CandidateUser[] = [];
  const take = 1000;
  let skip = 0;
  // 安全上限，避免极端情况下无限循环
  for (let i = 0; i < 1000; i++) {
    const batch = await prisma.user.findMany({
      where,
      select: CANDIDATE_SELECT,
      orderBy: { id: "asc" },
      skip,
      take,
    });
    if (batch.length === 0) break;
    all.push(...(batch as unknown as CandidateUser[]));
    if (batch.length < take) break;
    skip += take;
  }
  return all;
}

export async function POST(request: NextRequest) {
  try {
    // I-04 CSRF 防护
    const csrf = assertCSRF(request);
    if (!csrf.ok) {
      return NextResponse.json(
        { error: "CSRF_INVALID", message: "请求来源校验失败" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { action, userIds, filters, dryRun, reason, archivePersonalData } = body as {
      action?: ActionType;
      userIds?: string[];
      filters?: Filters;
      dryRun?: boolean;
      reason?: string;
      /** 批量删除时，对个人空间所有者是否一并归档其个人空间数据 */
      archivePersonalData?: boolean;
    };

    if (
      action !== "ban" &&
      action !== "unban" &&
      action !== "kick" &&
      action !== "delete"
    ) {
      return NextResponse.json({ error: "无效的操作类型" }, { status: 400 });
    }

    // 权限校验：仅平台管理员（ADMIN / OWNER）且具备对应动作权限
    const authResult = await requirePlatformPermission(
      request,
      ACTION_PERMISSION[action]
    );
    if (!authResult.authorized) {
      return authResult.errorResponse!;
    }
    const adminId = authResult.user!.id;

    // 必须提供 userIds 或 filters 之一
    const useFilter = !userIds || userIds.length === 0;
    if (useFilter && (!filters || Object.keys(filters).length === 0)) {
      return NextResponse.json(
        { error: "请提供用户 ID 列表或筛选条件" },
        { status: 400 }
      );
    }

    // 1. 获取候选用户
    let candidates: CandidateUser[];
    if (useFilter) {
      candidates = await fetchCandidatesByFilter(buildFilterWhere(filters!));
    } else {
      const uniqueIds = [...new Set(userIds as string[])];
      const found = await prisma.user.findMany({
        where: { id: { in: uniqueIds } },
        select: CANDIDATE_SELECT,
      });
      candidates = found as unknown as CandidateUser[];
    }

    // 2. 权限红线：排除操作者本人与特权账号（管理员 / 超级管理员 / OWNER）
    const safe = candidates.filter(
      (u) => u.id !== adminId && !isPrivileged(u.role)
    );
    // 用户 ID -> 展示名，供删除分支的拦截原因回显
    const nameById = new Map(
      safe.map((u) => [u.id, (u.name || u.email || u.id) as string])
    );

    // 3. 按动作类型过滤，区分可执行 / 跳过
    const now = Date.now();
    const skipped: { id: string; name: string; reason: string }[] = [];
    const processableIds: string[] = [];
    for (const u of safe) {
      const r = classify(action, u, now);
      if (r.processable) {
        processableIds.push(u.id);
      } else {
        skipped.push({
          id: u.id,
          name: u.name || u.email || u.id,
          reason: r.reason || "不符合操作条件",
        });
      }
    }

    const selectedCount = safe.length;
    let skippedCount = skipped.length;
    const processableCount = processableIds.length;

    // 预览模式：仅返回计数与跳过明细，不执行
    if (dryRun) {
      return NextResponse.json({
        success: true,
        action,
        selectedCount,
        processableCount,
        skippedCount,
        skipped,
      });
    }

    // 4. 分批批量执行（每批 ≤ 100，禁止循环单条更新）
    let processedCount = 0;
    let failedCount = 0;
    const opTime = new Date();

    const SESSION_CLEAR_DATA = {
      sessionToken: null,
      sessionExpiresAt: null,
      refreshToken: null,
      refreshTokenExpiresAt: null,
      refreshTokenPrev: null,
      lastForcedLogoutAt: opTime,
    };

    for (const chunk of chunkArray(processableIds, MAX_CHUNK)) {
      try {
        if (action === "ban") {
          // 幂等：仅对启用中用户生效
          const res = await prisma.user.updateMany({
            where: { id: { in: chunk }, status: "active" },
            data: {
              status: "banned",
              bannedUntil: null,
              banReason: reason || null,
              ...SESSION_CLEAR_DATA,
            },
          });
          processedCount += res.count;
        } else if (action === "unban") {
          // 幂等：仅对封禁中用户生效（临时/永久封禁均可解封，与单行解封一致）
          const res = await prisma.user.updateMany({
            where: { id: { in: chunk }, status: "banned" },
            data: { status: "active", bannedUntil: null },
          });
          processedCount += res.count;
        } else if (action === "kick") {
          const res = await prisma.user.updateMany({
            where: { id: { in: chunk } },
            data: SESSION_CLEAR_DATA,
          });
          processedCount += res.count;
          // 精确删除设备索引（按 userId，无模糊匹配）
          await prisma.userdevice.deleteMany({ where: { userId: { in: chunk } } });
        } else if (action === "delete") {
          // 归属优先的安全删除：绝不直接物理删除。
          // 逐用户执行软删除 + 归属判定；情况 C（企业唯一所有者）与
          // 未勾选归档的个人空间所有者将被拦截并计入 skipped。
          const archive = archivePersonalData === true;
          for (const id of chunk) {
            try {
              await executeAdminUserDeletion(id, {
                adminId,
                archivePersonalData: archive,
                reason: reason || undefined,
              });
              processedCount += 1;
            } catch (execErr) {
              skipped.push({
                id,
                name: nameById.get(id) || id,
                reason: execErr instanceof Error ? execErr.message : "删除被拦截",
              });
            }
          }
        }
      } catch (err) {
        console.error(`[批量${action}] 单批执行失败:`, err);
        failedCount += chunk.length;
      }
    }

    // 删除分支会在执行期把拦截（情况 C / 个人空间所有者未归档）写入 skipped，
    // 这里用最终 skipped 长度回填 skippedCount，保证响应与实际一致
    skippedCount = skipped.length;

    // 5. 审计日志：谁、何时、对谁、做了什么、成功/跳过多少
    await writeAuditLog(
      adminId,
      `user:batch_${action}`,
      {
        action,
        totalSelected: selectedCount,
        processedCount,
        skippedCount,
        failedCount,
        reason: reason || null,
        skippedSample: skipped.slice(0, 50).map((s) => ({ id: s.id, reason: s.reason })),
        scope: useFilter ? "filter" : "explicit",
      },
      null,
      null,
      request
    );

    console.log(
      `[批量${action}] 管理员 ${adminId} 处理 ${processedCount} 人（选中 ${selectedCount}，跳过 ${skippedCount}，失败 ${failedCount}）`
    );

    return NextResponse.json({
      success: true,
      action,
      selectedCount,
      processedCount,
      skippedCount,
      failedCount,
      skipped,
    });
  } catch (error) {
    console.error("Batch action API error:", error);
    return NextResponse.json(
      {
        error: "批量操作失败",
        details: error instanceof Error ? error.message : error,
      },
      { status: 500 }
    );
  }
}
