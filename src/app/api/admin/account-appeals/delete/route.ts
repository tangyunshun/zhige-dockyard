import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformPermission, writeAuditLog } from "@/lib/security";

/**
 * 批量删除申诉工单（单个删除同样走此接口，传单元素数组）
 *
 * 删除规则（按数据状态判定，前端与后端保持一致）：
 * - pending（待处理）：禁止删除，必须先完成审批，避免管理员用删除规避仲裁流程；
 * - approved / rejected / canceled / ban_recorded 等已处理工单：可删除（归档清理）。
 * 所有删除操作都会写入 operationlog 审计留痕（记录了哪几条工单被谁删除）。
 */
export async function POST(request: NextRequest) {
  try {
    // 鉴权：与审批、列表接口保持一致，需具备用户管理权限
    const authResult = await requirePlatformPermission(request, "user:update");
    if (!authResult.authorized) {
      return authResult.errorResponse!;
    }
    const operator = authResult.user!;

    const { appealIds } = await request.json();

    if (!Array.isArray(appealIds) || appealIds.length === 0) {
      return NextResponse.json({ message: "缺少待删除的工单 ID 列表" }, { status: 400 });
    }

    const appeals = await prisma.accountappeal.findMany({
      where: { id: { in: appealIds } },
    });
    const existingIds = new Set(appeals.map((a) => a.id));

    const skipped: { id: string; name: string; reason: string }[] = [];

    // 1. 已不存在（可能已被他人删除）
    for (const id of appealIds) {
      if (!existingIds.has(id)) {
        skipped.push({ id, name: id, reason: "工单不存在或已被删除" });
      }
    }

    // 2. 待处理工单禁止删除
    const deletable = appeals.filter((appeal) => {
      if (appeal.status === "pending") {
        skipped.push({
          id: appeal.id,
          name: appeal.userName || appeal.userAccount || appeal.id,
          reason: "待处理工单不可删除，请先完成审批",
        });
        return false;
      }
      return true;
    });

    let deletedCount = 0;
    if (deletable.length > 0) {
      const result = await prisma.accountappeal.deleteMany({
        where: { id: { in: deletable.map((a) => a.id) } },
      });
      deletedCount = result.count;

      // 审计留痕：删除属于高敏操作，记录操作人、被删工单与状态分布
      await writeAuditLog(
        operator.id,
        "appeal:deleted",
        {
          appealIds: deletable.map((a) => a.id),
          targetUserIds: deletable.map((a) => a.userId),
          statuses: deletable.map((a) => a.status),
          businessTypes: deletable.map((a) => a.businessType || "账号解封申诉"),
        },
        null,
        null,
        request
      );
    }

    return NextResponse.json({
      success: true,
      deletedCount,
      skippedCount: skipped.length,
      skipped,
      message: `已删除 ${deletedCount} 条申诉工单${skipped.length ? `，${skipped.length} 条被跳过` : ""}`,
    });
  } catch (error) {
    console.error("Delete appeals error:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "删除申诉工单失败" },
      { status: 500 }
    );
  }
}
