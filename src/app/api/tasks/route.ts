export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import { resolveTasksRefundMetaMap } from "@/lib/refund-status";
import {
  buildTaskWorkspacePermissionFilter,
  serializeTaskListItem,
} from "@/lib/task-query-helpers";
import { statusFilterToPrisma } from "@/lib/task-status";
import { recoverZombieRunningTasks } from "@/app/api/studio/handler";
import { enqueueRefundRecovery } from "@/lib/refund-recovery";

export async function GET(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json(
        { success: false, error: "登录已过期，请重新登录", code: "SESSION_EXPIRED" },
        { status: 401 },
      );
    }

    const userId = auth.user.id;

    // 0. 僵尸任务恢复：任务中心打开即触发（按执行租约原子转失败 + 退款入队，幂等可重入）
    //    此前恢复只在 simulate 入口触发，导致用户在任务中心看到永远"进行中"的假象。
    try {
      await recoverZombieRunningTasks(prisma, { enqueueRefundRecovery });
    } catch (e) {
      console.warn("[TasksAPI] 僵尸任务恢复非致命警告:", e);
    }

    // 1. 查询当前用户有成员关系或明确所有权的工作空间 ID（严禁信任未校验的 lastWorkspaceId）
    const [memberRecords, ownedWorkspaces] = await Promise.all([
      prisma.workspacemember.findMany({
        where: { userId },
        select: { workspaceId: true },
      }),
      prisma.workspace.findMany({
        where: { ownerId: userId },
        select: { id: true },
      }),
    ]);

    const validWsIds = [
      ...memberRecords.map((m) => m.workspaceId),
      ...ownedWorkspaces.map((w) => w.id),
    ];

    // 仅当用户 lastWorkspaceId 确实属于有效空间时才允许纳入上下文，否则绝对不加入
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { lastWorkspaceId: true } });
    const permissionFilter = buildTaskWorkspacePermissionFilter(validWsIds, user?.lastWorkspaceId);
    const targetWsIds = permissionFilter.tenantId.in;

    if (targetWsIds.length === 0) {
      return NextResponse.json({ success: true, data: { tasks: [], total: 0, page: 1, pageSize: 20, stats: { success: 0, failed: 0, running: 0, unknown: 0, pointsSum: 0 } } });
    }

    // ── 服务端筛选/分页参数（TASK-1：真分页，禁止前端全量切片）──
    const sp = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(sp.get("pageSize") || "20", 10) || 20));
    const statusParam = (sp.get("status") || "").toUpperCase();
    const workspaceParam = sp.get("workspaceId") || "";
    const keyword = (sp.get("keyword") || "").trim();
    const scopeMine = sp.get("scope") === "mine";

    const where: Record<string, unknown> = {
      tenantId: { in: targetWsIds },
      status: { not: "ARCHIVED" },
    };
    const statusFilter = statusFilterToPrisma(statusParam);
    if (statusFilter) where.status = statusFilter;
    if (workspaceParam && targetWsIds.includes(workspaceParam)) {
      where.tenantId = workspaceParam;
    }
    if (keyword) {
      where.name = { contains: keyword };
    }
    // "只看我的"：仅返回当前用户发起的任务
    if (scopeMine) {
      where.userId = userId;
    }

    // 2. 查询这些工作空间的元数据 (名称与类型)
    const workspaces = await prisma.workspace.findMany({
      where: { id: { in: targetWsIds } },
      select: { id: true, name: true, type: true },
    });

    const wsMap = new Map<string, { name: string; type: string }>();
    workspaces.forEach((w) => {
      wsMap.set(w.id, { name: w.name, type: w.type });
    });

    // 3. 跨空间查询 componenttask（服务端过滤 + 分页 + 计数）
    const [tasks, total] = await Promise.all([
      prisma.componenttask.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.componenttask.count({ where }),
    ]);

    // 4. 查询 componentcatalog 匹配真实组件名称
    const compIds = Array.from(new Set(tasks.map((t) => t.type).filter((id): id is string => !!id)));
    const catalogList = await prisma.componentcatalog.findMany({
      where: { id: { in: compIds } },
      select: { id: true, name: true },
    });

    const compNameMap = new Map<string, string>();
    catalogList.forEach((c) => {
      compNameMap.set(c.id, c.name);
    });

    // 5. 批量反查权威退款与账务状态（服务端数据库真源，严禁客户端臆测）
    const taskIds = tasks.map((t) => t.id);
    const taskConfigMap = new Map<string, { chargeAttempted?: boolean | null; status?: string }>();
    tasks.forEach((t) => {
      const cfg = t.config && typeof t.config === "object" ? (t.config as Record<string, unknown>) : null;
      taskConfigMap.set(t.id, {
        // 三态收口：仅采信明确布尔值，缺失/未知一律保留 null，严禁推断为「已发生扣费」
        chargeAttempted: typeof cfg?.chargeAttempted === "boolean" ? cfg.chargeAttempted : null,
        status: t.status,
      });
    });
    const refundMetaMap = await resolveTasksRefundMetaMap(taskIds, prisma, taskConfigMap);

    // 6. 组装最小化返回契约（严禁返回 config.inputMaterial、原始文件、Prompt、完整 result 原文）
    const formattedData = tasks.map((t) => {
      const cId = t.type || "";
      const wsInfo = wsMap.get(t.tenantId || "") || { name: "工作空间", type: "PERSONAL" };
      const refundMeta = refundMetaMap.get(t.id) || {
        refundStatus: "UNKNOWN" as const,
        refundedPoints: null,
        chargeAttempted: null,
      };
      return serializeTaskListItem(t, wsInfo, compNameMap.get(cId) || t.type || "", refundMeta);
    });

    // 7. 统计口径（跟随当前筛选，不随分页截断；点数取实际结算值，缺失回退预估）
    const statStatusFilter = { ...where } as Record<string, unknown>;
    delete statStatusFilter.status;
    const statusBase = statusFilter ? statusFilter : { not: "ARCHIVED" };
    const statGroups = await prisma.componenttask.groupBy({
      by: ["status"],
      where: { ...statStatusFilter, status: statusBase },
      _count: { _all: true },
    });
    const stats = { success: 0, failed: 0, running: 0, unknown: 0, pointsSum: 0 };
    statGroups.forEach((g) => {
      const n = g._count._all;
      const s = (g.status || "").toUpperCase();
      if (["SUCCESS", "COMPLETED", "DONE", "SUCCEEDED"].includes(s)) stats.success += n;
      else if (["FAILED", "ERROR", "CANCELLED", "CANCELED", "TIMEOUT", "REJECTED"].includes(s)) stats.failed += n;
      else if (["RUNNING", "PENDING", "QUEUED", "PROCESSING", "READY", "IN_PROGRESS"].includes(s)) stats.running += n;
      else stats.unknown += n;
    });
    // 点数合计：统计范围内逐任务取实际结算值（缺失回退预估），上限 1000 行防全表扫描
    const statTasks = await prisma.componenttask.findMany({
      where: { ...statStatusFilter, status: statusBase },
      select: { config: true },
      take: 1000,
      orderBy: { createdAt: "desc" },
    });
    statTasks.forEach((t) => {
      const cfg = t.config && typeof t.config === "object" ? (t.config as Record<string, unknown>) : null;
      const exec = cfg?.execution && typeof cfg.execution === "object" ? (cfg.execution as Record<string, unknown>) : null;
      const actual = typeof exec?.actualPoints === "number" ? exec.actualPoints : null;
      const est = typeof exec?.estimatedPoints === "number" ? exec.estimatedPoints : 0;
      stats.pointsSum += actual ?? est;
    });

    return NextResponse.json({
      success: true,
      data: { tasks: formattedData, total, page, pageSize, stats },
    });
  } catch (error: any) {
    console.error("[TasksAPI Error]:", error);
    return NextResponse.json({ success: false, error: error.message || "获取任务档案失败" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ success: false, error: "未登录或身份令牌失效" }, { status: 401 });
    }

    const userId = auth.user.id;

    let idsToDelete: string[] = [];
    const urlParams = request.nextUrl.searchParams;
    const singleId = urlParams.get("id");
    const multiIds = urlParams.get("ids");

    if (singleId) {
      idsToDelete.push(singleId);
    } else if (multiIds) {
      idsToDelete = multiIds.split(",").map((s) => s.trim()).filter(Boolean);
    } else {
      try {
        const body = await request.json();
        if (body.taskId) idsToDelete.push(body.taskId);
        if (Array.isArray(body.taskIds)) idsToDelete.push(...body.taskIds);
      } catch (e) {
        // JSON body parsing fallback
      }
    }

    idsToDelete = Array.from(new Set(idsToDelete));
    if (idsToDelete.length === 0) {
      return NextResponse.json({ success: false, error: "未指定需要删除/归档的任务 ID" }, { status: 400 });
    }

    // 1. 先查询待删除的任务对象及其租户空间
    const targetTasks = await prisma.componenttask.findMany({
      where: { id: { in: idsToDelete } },
      select: { id: true, tenantId: true, userId: true, status: true },
    });

    if (targetTasks.length === 0) {
      return NextResponse.json({ success: false, error: "目标任务不存在或已被删除" }, { status: 404 });
    }

    // 2. 校验权限边界：用户必须对任务所在的 workspaceId 拥有成员关系或所有权
    const tenantIds = Array.from(
      new Set(
        targetTasks
          .map((t) => t.tenantId)
          .filter((id): id is string => typeof id === "string" && id.length > 0),
      ),
    );
    const [memberSpaces, ownedSpaces] = await Promise.all([
      prisma.workspacemember.findMany({
        where: { userId, workspaceId: { in: tenantIds } },
        select: { workspaceId: true, role: true },
      }),
      prisma.workspace.findMany({
        where: { ownerId: userId, id: { in: tenantIds } },
        select: { id: true },
      }),
    ]);

    const allowedWorkspaceIds = new Set<string>([
      ...memberSpaces.map((m) => m.workspaceId),
      ...ownedSpaces.map((w) => w.id),
    ]);

    // 检查是否存在无权限操作的任务
    for (const t of targetTasks) {
      if (!t.tenantId || !allowedWorkspaceIds.has(t.tenantId)) {
        return NextResponse.json(
          {
            success: false,
            error: `越权拦截：您无权操作工作空间 [${t.tenantId || "未知"}] 下的任务记录！`,
          },
          { status: 403 },
        );
      }
    }

    // 3. 沿用 archive 语义软归档，防止物理删除丢失审计事实
    const targetIds = targetTasks.map((t) => t.id);
    const updateRes = await prisma.componenttask.updateMany({
      where: { id: { in: targetIds } },
      data: { status: "ARCHIVED" },
    });

    // 4. 补全操作审计日志记录（杜绝操作丢失审计痕迹）
    await Promise.all(
      targetTasks.map((t) =>
        prisma.operationlog.create({
          data: {
            id: `op_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            userId,
            workspaceId: t.tenantId || "",
            action: "ARCHIVE_TASK",
            resource: "TASK",
            details: {
              taskId: t.id,
              workspaceId: t.tenantId,
              userId,
              archivedAt: new Date().toISOString(),
            },
          },
        }),
      ),
    ).catch((e) => console.warn("[TasksAPI DELETE] 写入操作审计日志警告:", e));

    return NextResponse.json({
      success: true,
      message: `已成功归档 ${updateRes.count} 笔任务分析成果记录`,
      count: updateRes.count,
      archivedIds: targetIds,
    });
  } catch (error: any) {
    console.error("[TasksAPI DELETE Error]:", error);
    return NextResponse.json({ success: false, error: error.message || "归档任务分析记录失败" }, { status: 500 });
  }
}
