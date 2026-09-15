export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import { requireWorkspaceMembership } from "@/lib/security";
import { checkAndResetQuotaCycle } from "@/lib/quota-cycle";

/**
 * GET /api/workspace/members/quota
 * 获取空间成员的算力点额度、已用情况以及空间全局总算力池概览
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json({ error: "缺少 workspaceId 参数" }, { status: 400 });
    }

    // 1. 成员资格校验
    const isMember = await requireWorkspaceMembership(auth.user.id, workspaceId);
    if (!isMember) {
      return NextResponse.json({ error: "越权警告：您非该工作空间成员" }, { status: 403 });
    }

    // 2. 检查请求者是否具备管理员/所有者权限
    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    const requesterMember = await prisma.workspacemember.findUnique({
      where: { userId_workspaceId: { userId: auth.user.id, workspaceId } },
    });

    const isOwner = ws?.ownerId === auth.user.id || requesterMember?.role === "OWNER";
    const isAdmin = requesterMember?.role === "ADMIN";
    const canManageQuota = isOwner || isAdmin;
    // 普通成员（非所有者/管理员）：仅可见自身算力点数据，不可见空间共享池总额
    const isMemberOnly = !isOwner && !isAdmin && requesterMember?.role === "MEMBER";

    // 3. 返回数据前，调用跨自然月重置预检
    await checkAndResetQuotaCycle(prisma, workspaceId, auth.user.id);

    // 4. 查询空间的全局算力池（若不存在则自动执行自愈初始化）
    let quota = await prisma.workspacequota.findUnique({
      where: { workspaceId },
      include: { membershiplevel: true },
    });

    if (!quota) {
      try {
        const isEnterprise = ws?.type === "ENTERPRISE";
        quota = await prisma.workspacequota.create({
          data: {
            id: crypto.randomUUID(),
            workspaceId,
            membershipLevelId: isEnterprise ? "STANDARD" : "FREE",
            // 结构性自愈：新配额余额一律 0 起步，不赠送任何免费算力
            tokenBalance: BigInt(0),
            storageLimit: BigInt(isEnterprise ? 10 * 1024 * 1024 * 1024 : 1024 * 1024 * 1024),
            apiCallsLimit: BigInt(isEnterprise ? 50000 : 1000),
            storageUsed: BigInt(0),
            apiCallsUsed: BigInt(0),
            updatedAt: new Date(),
          },
          include: { membershiplevel: true },
        });
      } catch (createErr) {
        console.warn("[members/quota] 空间配额自愈创建非致命提示:", createErr);
      }
    }

    // 5. 查询最新的成员列表与额度
    const members = await prisma.workspacemember.findMany({
      where: { workspaceId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
      },
    });

    let totalAllocated = BigInt(0);
    const serializedMembers = members.map((m) => {
      const limitNum = m.monthlyTokenLimit !== null && m.monthlyTokenLimit !== undefined ? Number(m.monthlyTokenLimit) : null;
      if (limitNum !== null && m.role === "MEMBER") {
        totalAllocated += BigInt(limitNum);
      }
      return {
        id: m.id,
        userId: m.userId,
        role: m.role,
        userName: m.user?.name || "未知用户",
        userEmail: m.user?.email || "",
        userAvatar: m.user?.avatar || null,
        monthlyTokenLimit: limitNum,
        monthlyTokenUsed: Number(m.monthlyTokenUsed || 0),
        tokenBalance: Number(m.tokenBalance || 0),
        quotaResetAt: m.quotaResetAt ? m.quotaResetAt.toISOString() : null,
      };
    });

    // 普通成员视图：只返回自身额度与独立余额，隐藏空间共享池总额
    if (isMemberOnly && requesterMember) {
      const self = serializedMembers.find((m) => m.userId === auth.user.id) || {
        id: requesterMember.id,
        userId: requesterMember.userId,
        role: requesterMember.role,
        userName: requesterMember.user?.name || "我",
        userEmail: requesterMember.user?.email || "",
        userAvatar: requesterMember.user?.avatar || null,
        monthlyTokenLimit: requesterMember.monthlyTokenLimit != null ? Number(requesterMember.monthlyTokenLimit) : null,
        monthlyTokenUsed: Number(requesterMember.monthlyTokenUsed || 0),
        tokenBalance: Number(requesterMember.tokenBalance || 0),
        quotaResetAt: requesterMember.quotaResetAt ? requesterMember.quotaResetAt.toISOString() : null,
      };
      return NextResponse.json({
        canManageQuota: false,
        isMemberView: true,
        members: [self],
        myTokenBalance: Number(requesterMember.tokenBalance || 0),
        workspaceQuota: {
          tokenBalance: Number(requesterMember.tokenBalance || 0),
          levelName: quota?.membershiplevel?.nameZh || (ws?.type === "ENTERPRISE" ? "企业标准版" : "免费版"),
          levelTokenLimit: 0,
          totalAllocatedToMembers: 0,
          unallocatedBalance: 0,
          isMemberView: true,
          resetAt: quota?.resetAt ? quota.resetAt.toISOString() : null,
        },
      });
    }

    const tokenBalanceNum = quota ? Number(quota.tokenBalance) : 0;
    const levelTokenLimitNum = quota?.membershiplevel ? Number(quota.membershiplevel.tokenLimit || 1000) : 1000;
    const allocatedNum = Number(totalAllocated);
    // 无限额度（tokenBalance = -1）：未锁定池同样标记为无限（-1），避免被 Math.max(0, ...) 折叠成「0」
    const isUnlimited = tokenBalanceNum === -1;
    const unallocatedBalance = isUnlimited ? -1 : Math.max(0, tokenBalanceNum - allocatedNum);

    return NextResponse.json({
      canManageQuota,
      isMemberView: false,
      members: serializedMembers,
      workspaceQuota: {
        tokenBalance: tokenBalanceNum,
        levelName: quota?.membershiplevel?.nameZh || (ws?.type === "ENTERPRISE" ? "企业标准版" : "免费版"),
        levelTokenLimit: levelTokenLimitNum,
        totalAllocatedToMembers: allocatedNum,
        unallocatedBalance,
        isMemberView: false,
        resetAt: quota?.resetAt ? quota.resetAt.toISOString() : null,
      },
    });
  } catch (error) {
    console.error("获取成员算力额度失败:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}

/**
 * POST /api/workspace/members/quota
 * 配置目标成员的月度算力额度 (带有空间总算力池上限阻断)
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const body = await request.json();
    const { workspaceId, targetUserId, monthlyTokenLimit } = body;

    if (!workspaceId || !targetUserId) {
      return NextResponse.json({ error: "缺少必要参数 workspaceId 或 targetUserId" }, { status: 400 });
    }

    // 1. 成员资格校验
    const isMember = await requireWorkspaceMembership(auth.user.id, workspaceId);
    if (!isMember) {
      return NextResponse.json({ error: "越权警告：您非该工作空间成员" }, { status: 403 });
    }

    // 2. 检查请求者是否为 OWNER 或 ADMIN
    const requesterMember = await prisma.workspacemember.findUnique({
      where: { userId_workspaceId: { userId: auth.user.id, workspaceId } },
    });
    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId } });

    const isOwner = ws?.ownerId === auth.user.id || requesterMember?.role === "OWNER";
    const isAdmin = requesterMember?.role === "ADMIN";

    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: "越权警告：仅空间管理员或所有者可配置成员算力额度" }, { status: 403 });
    }

    // 3. 校验 targetUserId 必须属于该 workspace
    const targetMember = await prisma.workspacemember.findUnique({
      where: { userId_workspaceId: { userId: targetUserId, workspaceId } },
    });

    if (!targetMember) {
      return NextResponse.json({ error: "目标成员不存在于该工作空间" }, { status: 404 });
    }

    // 4. 禁止给 OWNER 或 ADMIN 设置额度
    if (ws?.ownerId === targetUserId || targetMember.role === "OWNER") {
      return NextResponse.json({ error: "不可给空间所有者设置额度" }, { status: 400 });
    }

    if (targetMember.role === "ADMIN") {
      return NextResponse.json({ error: "不可给管理员设置额度，仅支持为普通成员分配额度" }, { status: 400 });
    }

    // 5. 空间总算力池校验 + 成员独立余额分配
    // 「配置算力」= 将成员独立余额对齐到所设月度上限：差额从共享池转入（分配）或转回（回收）
    const quota = await prisma.workspacequota.findUnique({
      where: { workspaceId },
    });

    const poolBalance = quota ? Number(quota.tokenBalance) : 0;
    const poolUnlimited = poolBalance === -1;
    const requestedLimitNum = monthlyTokenLimit !== null && monthlyTokenLimit !== undefined && monthlyTokenLimit !== ""
      ? Number(monthlyTokenLimit)
      : null;
    const effectiveLimit = requestedLimitNum !== null ? requestedLimitNum : 0;
    const currentMemberBalance = targetMember.tokenBalance ? Number(targetMember.tokenBalance) : 0;
    const diff = effectiveLimit - currentMemberBalance;

    // 无限额度（tokenBalance = -1）不限制成员分配
    if (!poolUnlimited && diff > 0 && diff > poolBalance) {
      return NextResponse.json(
        {
          error: `分配阻断：当前空间可用总算力仅剩 ${poolBalance} 点，无法为该成员分配 ${effectiveLimit} 点额度（需从共享池转入 ${diff} 点）！请先充值算力包。`,
          suggestRecharge: true,
          currentTokenBalance: poolBalance,
        },
        { status: 400 }
      );
    }

    // 6. 事务内：更新成员上限 + 成员独立余额转入/转回共享池 + 写成员归属流水
    const updated = await prisma.$transaction(async (tx) => {
      const updatedMember = await tx.workspacemember.update({
        where: { id: targetMember.id },
        data: {
          monthlyTokenLimit: requestedLimitNum !== null ? BigInt(requestedLimitNum) : null,
        },
      });

      const wsInfo = await tx.workspace.findUnique({
        where: { id: workspaceId },
        select: { name: true, type: true },
      });
      const operator = await tx.user.findUnique({
        where: { id: auth.user.id },
        select: { name: true, email: true },
      });
      const operatorName = operator?.name || operator?.email || "管理员";

      if (diff !== 0) {
        if (diff > 0) {
          // 共享池 → 成员独立余额
          if (!poolUnlimited) {
            await tx.workspacequota.update({
              where: { workspaceId },
              data: { tokenBalance: { decrement: BigInt(diff) }, updatedAt: new Date() },
            });
          }
          await tx.workspacemember.update({
            where: { id: targetMember.id },
            data: { tokenBalance: { increment: BigInt(diff) }, updatedAt: new Date() },
          });
        } else {
          // 成员独立余额 → 共享池（回收）
          const reclaim = BigInt(-diff);
          await tx.workspacemember.update({
            where: { id: targetMember.id },
            data: { tokenBalance: { decrement: reclaim }, updatedAt: new Date() },
          });
          if (!poolUnlimited) {
            await tx.workspacequota.update({
              where: { workspaceId },
              data: { tokenBalance: { increment: reclaim }, updatedAt: new Date() },
            });
          }
        }

        const afterMember = await tx.workspacemember.findUnique({ where: { id: targetMember.id } });
        await tx.pointledger.create({
          data: {
            id: crypto.randomUUID(),
            direction: diff > 0 ? "IN" : "OUT",
            type: "MANUAL_ADJUST",
            scope: "WORKSPACE",
            userId: targetMember.userId,
            userEmail: targetMember.user?.email ?? null,
            workspaceId,
            workspaceType: wsInfo?.type ?? null,
            workspaceName: wsInfo?.name ?? null,
            operatorId: auth.user.id,
            points: BigInt(Math.abs(diff)),
            balanceAfter: BigInt(afterMember ? Number(afterMember.tokenBalance) : 0),
            paymentMethod: "MANUAL",
            title:
              diff > 0
                ? `管理员分配算力（${operatorName}）`
                : `管理员回收算力额度（${operatorName}）`,
            remark:
              diff > 0
                ? `由空间管理员从共享池分配 ${Math.abs(diff)} 算力点至成员独立余额`
                : `成员独立余额回收 ${Math.abs(diff)} 算力点至共享池`,
          },
        });
      }

      return updatedMember;
    });

    return NextResponse.json({
      success: true,
      message:
        requestedLimitNum === null
          ? "已清空该成员算力限制，并回收其独立余额至共享池"
          : diff > 0
          ? `已为该成员分配 ${diff} 算力点（独立余额 ${effectiveLimit}）`
          : diff < 0
          ? `已回收 ${Math.abs(diff)} 算力点至共享池`
          : "成员算力额度设置成功",
      member: {
        userId: updated.userId,
        monthlyTokenLimit: updated.monthlyTokenLimit !== null ? Number(updated.monthlyTokenLimit) : null,
        monthlyTokenUsed: Number(updated.monthlyTokenUsed || 0),
        tokenBalance: Number(updated.tokenBalance || 0),
      },
    });
  } catch (error) {
    console.error("更新成员算力额度失败:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
