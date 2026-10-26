import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import { requireStepUp } from "@/lib/step-up";
import { assertWorkspaceWritable } from "@/lib/workspace-readonly-guard";
import { transferPoints } from "@/lib/credit-service";
import { writeAuditLog } from "@/lib/security";

/**
 * 企业空间所有权转让（OWNER → ADMIN 成员）
 *
 * 语义（已拍板）：
 * - 仅企业空间支持；个人空间 400；
 * - 受让人必须是在册成员且角色为 ADMIN；
 * - 单事务内完成：ownerId 变更 + 新所有者成员角色升 OWNER + 原所有者降 ADMIN（保留成员身份）；
 * - 账务交接：共享池挂在空间上随空间走；受让人名下的成员独立余额清扫回共享池
 *   （走 credit-service MEMBER_TO_POOL 回收路径，写 pointledger 双腿流水，防重复计账）；
 * - 高危操作：requireStepUp 二次身份验证（场景 transfer_workspace）；
 * - 全程留痕：operationlog(TRANSFER_OWNERSHIP) + writeAuditLog("workspace:transfer_ownership")。
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await validateUser(request.headers.get("Authorization"), request);
    if (!authResult.valid || !authResult.user) {
      return NextResponse.json({ error: authResult.error || "UNAUTHORIZED" }, { status: 401 });
    }
    const userId = authResult.user.id;

    const body = await request.json();
    const { workspaceId, targetUserId } = body;
    if (!workspaceId || !targetUserId) {
      return NextResponse.json({ error: "缺少工作空间 ID 或受让人 ID" }, { status: 400 });
    }
    if (targetUserId === userId) {
      return NextResponse.json({ error: "不能转让给自己" }, { status: 400 });
    }

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
    });
    if (!workspace) {
      return NextResponse.json({ error: "工作空间不存在" }, { status: 404 });
    }
    if (workspace.type !== "ENTERPRISE") {
      return NextResponse.json({ error: "个人空间不支持转让" }, { status: 400 });
    }

    // 仅当前所有者可发起转让
    if (workspace.ownerId !== userId) {
      return NextResponse.json({ error: "仅空间所有者可以转让空间" }, { status: 403 });
    }

    // 归档 / 停用空间禁止转让（硬只读）
    await assertWorkspaceWritable(workspaceId);

    // 受让人必须是在册管理员
    const targetMember = await prisma.workspacemember.findFirst({
      where: { workspaceId, userId: targetUserId },
    });
    if (!targetMember) {
      return NextResponse.json({ error: "受让人不是该空间成员" }, { status: 400 });
    }
    if (targetMember.role !== "ADMIN") {
      return NextResponse.json({ error: "只能将空间转让给空间管理员" }, { status: 400 });
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { name: true, email: true },
    });

    // 高危操作二次身份验证
    const stepUp = await requireStepUp(request, "transfer_workspace", userId);
    if (!stepUp.ok) {
      return NextResponse.json(
        {
          error: stepUp.error,
          message:
            stepUp.error === "SEC_AUTH_REQUIRED"
              ? "转让所有权属于高危操作，需要进行二次身份验证"
              : "验证令牌无效或已过期，请重新验证",
        },
        { status: stepUp.status }
      );
    }

    // 受让人名下成员独立余额清扫回共享池（先于角色变更执行，走既有回收路径写双腿流水）
    const memberBalance = Number(targetMember.tokenBalance || 0);
    if (memberBalance > 0) {
      await transferPoints({
        workspaceId,
        userId: targetUserId,
        points: memberBalance,
        direction: "MEMBER_TO_POOL",
        operatorId: userId,
        reason: "OWNERSHIP_TRANSFER",
        workspaceType: workspace.type,
        workspaceName: workspace.name,
        userEmail: targetUser?.email || null,
      });
    }

    // 角色交接：单事务，要么全成功要么全回滚
    await prisma.$transaction(async (tx) => {
      await tx.workspace.update({
        where: { id: workspaceId },
        data: { ownerId: targetUserId },
      });
      await tx.workspacemember.update({
        where: { id: targetMember.id },
        data: { role: "OWNER" },
      });
      const oldOwnerMember = await tx.workspacemember.findFirst({
        where: { workspaceId, userId },
      });
      if (oldOwnerMember) {
        await tx.workspacemember.update({
          where: { id: oldOwnerMember.id },
          data: { role: "ADMIN" },
        });
      } else {
        await tx.workspacemember.create({
          data: {
            id: crypto.randomUUID(),
            userId,
            workspaceId,
            role: "ADMIN",
          },
        });
      }
    });

    // 全程留痕（非阻断式）
    await prisma.operationlog
      .create({
        data: {
          id: crypto.randomUUID(),
          userId,
          workspaceId,
          action: "TRANSFER_OWNERSHIP",
          resource: "Workspace",
          details: {
            workspaceName: workspace.name,
            fromOwnerId: userId,
            toOwnerId: targetUserId,
            toOwnerName: targetUser?.name || "",
            toOwnerEmail: targetUser?.email || "",
          },
        },
      })
      .catch(() => {});
    await writeAuditLog(userId, "workspace:transfer_ownership", {
      workspaceId,
      fromOwnerId: userId,
      toOwnerId: targetUserId,
    }, workspaceId, null, request).catch(() => {});

    // 成员关系变化，立即失效只读缓存
    const { clearServerCache } = await import("@/lib/serverCache");
    clearServerCache();

    return NextResponse.json({
      success: true,
      message: `空间所有权已转让给 ${targetUser?.name || "该管理员"}，你已变为空间管理员`,
      workspace: { id: workspace.id, name: workspace.name, ownerId: targetUserId },
    });
  } catch (error) {
    console.error("Transfer workspace ownership error:", error);
    return NextResponse.json({ error: "转让所有权失败", details: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
