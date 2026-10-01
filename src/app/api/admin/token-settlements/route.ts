import { NextRequest, NextResponse } from "next/server";
import { requirePlatformPermission, writeAuditLog } from "@/lib/security";
import { prisma } from "@/lib/prisma";
import {
  getSettlementDictFromDb,
  formatSettlementErrorCode,
  translateSettlementAuditMessage,
} from "@/lib/settlement-dict";

/**
 * 管理员：查询 Token 结算列表
 * GET /api/admin/token-settlements?status=REQUIRES_REVIEW&page=1&pageSize=10&taskId=&userId=&workspaceId=
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requirePlatformPermission(request, "system:manage", "billing:read", "billing:manage");
    if (!auth.authorized) {
      return auth.errorResponse || NextResponse.json({ success: false, error: "无权限" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || undefined;
    const taskId = searchParams.get("taskId") || undefined;
    const userId = searchParams.get("userId") || undefined;
    const workspaceId = searchParams.get("workspaceId") || undefined;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "10", 10)));

    const where: Record<string, unknown> = {};
    if (status && status !== "ALL") {
      where.status = status;
    }
    if (taskId) {
      where.taskId = { contains: taskId };
    }
    if (userId) {
      where.userId = { contains: userId };
    }
    if (workspaceId) {
      where.workspaceId = { contains: workspaceId };
    }

    // 并行读取数据库持久化字典与分页数据（拒绝写死在代码中，以数据库 system_config 为准）
    const [total, records, dict] = await Promise.all([
      prisma.tokensettlement.count({ where }),
      prisma.tokensettlement.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      getSettlementDictFromDb(),
    ]);

    const serializedRecords = JSON.parse(
      JSON.stringify(records, (_key, value) =>
        typeof value === "bigint" ? Number(value) : value
      )
    );

    // 结合数据库字典对结算单状态、异常码和审计消息进行中文与视觉元数据富化，100% 数据库动态驱动
    const enrichedRecords = serializedRecords.map((r: any) => {
      const statusMeta = dict.statuses?.[r.status];
      return {
        ...r,
        errorCodeName: formatSettlementErrorCode(r.errorCode, dict),
        auditMessageDisplay: translateSettlementAuditMessage(r.auditMessage, dict),
        statusName:
          (typeof statusMeta === "object" ? statusMeta?.label : statusMeta) || r.status,
        statusStyle:
          (typeof statusMeta === "object" ? statusMeta?.style : null) ||
          "bg-slate-100 text-slate-700 border-slate-200",
        statusDot:
          (typeof statusMeta === "object" ? statusMeta?.dot : null) || "bg-slate-400",
        statusDesc:
          (typeof statusMeta === "object" ? statusMeta?.desc : null) || "",
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        records: enrichedRecords,
        dictionary: dict,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      },
    });
  } catch (err: unknown) {
    console.error("[admin:token-settlements:list] 查询结算列表失败:", (err as Error)?.message || err);
    return NextResponse.json(
      { success: false, error: "查询结算列表失败" },
      { status: 500 }
    );
  }
}

/**
 * 管理员：删除 / 批量删除结算单
 * DELETE /api/admin/token-settlements
 * Request Body: { taskIds: string[] } 或 URL Query ?taskId=xxx
 *
 * 资金安全与防破坏性防御规则：
 * 1. 待人工复核（REQUIRES_REVIEW）或预扣中（HOLD）的单据代表资金处于挂起或未决争议态，严禁直接物理删除，避免资金脱幅或逃避复核仲裁；
 * 2. 仅允许对已终态（SETTLED 已结算、RELEASED 已全额释放）的归档结算单执行删除；
 * 3. 在数据库原子事务中安全级联清理结算单、关联预扣行与异常恢复任务；
 * 4. 统一写入管理员操作审计留痕（operationlog）。
 */
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requirePlatformPermission(request, "system:manage", "billing:manage");
    if (!auth.authorized) {
      return auth.errorResponse || NextResponse.json({ success: false, error: "无权限" }, { status: 403 });
    }
    const operator = auth.user!;

    // 提取待删除 taskIds（支持 JSON 请求体或 Query 参数）
    let taskIds: string[] = [];
    const { searchParams } = new URL(request.url);
    const queryTaskId = searchParams.get("taskId");

    if (queryTaskId) {
      taskIds.push(queryTaskId.trim());
    } else {
      const body = await request.json().catch(() => ({}));
      if (Array.isArray(body?.taskIds)) {
        taskIds = body.taskIds.map((id: unknown) => String(id).trim()).filter(Boolean);
      } else if (typeof body?.taskId === "string" && body.taskId.trim()) {
        taskIds = [body.taskId.trim()];
      }
    }

    if (taskIds.length === 0) {
      return NextResponse.json(
        { success: false, error: "缺少待删除的结算任务标识 (taskIds)" },
        { status: 400 }
      );
    }

    // 批量查出对应单据
    const settlements = await prisma.tokensettlement.findMany({
      where: { taskId: { in: taskIds } },
    });
    const existingTaskIds = new Set(settlements.map((s) => s.taskId));

    const skipped: { taskId: string; reason: string }[] = [];

    // 1. 检查不存在的单据
    for (const tid of taskIds) {
      if (!existingTaskIds.has(tid)) {
        skipped.push({ taskId: tid, reason: "单据不存在或已被清理" });
      }
    }

    // 2. 区分终态与非终态单据
    const deletable: typeof settlements = [];
    for (const record of settlements) {
      if (record.status === "REQUIRES_REVIEW") {
        skipped.push({
          taskId: record.taskId,
          reason: "待人工复核单据不可直接删除，需先完成裁决按实扣费或全额退款",
        });
      } else if (record.status === "HOLD") {
        skipped.push({
          taskId: record.taskId,
          reason: "资金预扣锁定中的单据不可直接删除，需等待模型完成或执行释放",
        });
      } else {
        deletable.push(record);
      }
    }

    let deletedCount = 0;
    if (deletable.length > 0) {
      const deletableTaskIds = deletable.map((r) => r.taskId);

      // 事务原子性清理：关联的恢复表、结算表及预扣记录
      await prisma.$transaction(async (tx) => {
        await tx.tokensettlementrecovery.deleteMany({
          where: { taskId: { in: deletableTaskIds } },
        });
        await tx.tokensettlement.deleteMany({
          where: { taskId: { in: deletableTaskIds } },
        });
        await tx.tokensettlementhold.deleteMany({
          where: { taskId: { in: deletableTaskIds } },
        });
      });

      deletedCount = deletableTaskIds.length;

      // 写入高敏操作审计日志
      await writeAuditLog(
        operator.id,
        "token_settlement:delete",
        {
          deletedTaskIds: deletableTaskIds,
          deletedCount,
          skippedCount: skipped.length,
          skipped,
        },
        null,
        null,
        request
      );
    }

    const message = `已成功删除 ${deletedCount} 条结算单${
      skipped.length > 0 ? `，另有 ${skipped.length} 条单据因未终态或不存在被安全跳过` : ""
    }`;

    return NextResponse.json({
      success: true,
      deletedCount,
      skippedCount: skipped.length,
      skipped,
      message,
    });
  } catch (err: unknown) {
    console.error("[admin:token-settlements:delete] 删除结算单失败:", (err as Error)?.message || err);
    return NextResponse.json(
      { success: false, error: "删除结算单失败，请稍后重试" },
      { status: 500 }
    );
  }
}
