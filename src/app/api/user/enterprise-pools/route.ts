export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import { getPoolLowThreshold, resolvePoolLowThreshold } from "@/constants/workspace-plans";

/**
 * GET /api/user/enterprise-pools
 * 返回「当前用户作为所有者的企业空间」及其共享池状态，供个人工作台 / 空间中枢统一管理企业池：
 *   - tokenBalance：企业共享池当前余额（业务上 -1 表示无限额度档）
 *   - poolLowThreshold / planDefault / effectiveThreshold：低余额预警阈值三态
 * 仅返回 ownerId = 当前用户的企业空间（回收与阈值设置均为所有者专属操作）。
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const userId = auth.user.id;

    // 两次简单查询 + JS 组装，规避旧版 Prisma Client 关联查询兼容问题
    const workspaces = await prisma.workspace.findMany({
      where: { ownerId: userId, type: "ENTERPRISE" },
      select: { id: true, name: true, plan: true },
      orderBy: { createdAt: "desc" },
    });

    if (workspaces.length === 0) {
      return NextResponse.json({ success: true, pools: [] });
    }

    const wsIds = workspaces.map((w) => w.id);
    const quotas = await prisma.workspacequota.findMany({
      where: { workspaceId: { in: wsIds } },
      select: { workspaceId: true, tokenBalance: true, poolLowThreshold: true },
    });
    const quotaMap = new Map(quotas.map((q) => [q.workspaceId, q]));

    const pools = workspaces.map((ws) => {
      const quota = quotaMap.get(ws.id);
      const quotaThreshold =
        quota?.poolLowThreshold != null ? Number(quota.poolLowThreshold) : null;
      return {
        id: ws.id,
        name: ws.name,
        plan: ws.plan,
        tokenBalance: quota ? Number(quota.tokenBalance) : 0,
        poolLowThreshold: quotaThreshold,
        planDefault: getPoolLowThreshold(ws.plan),
        effectiveThreshold: resolvePoolLowThreshold(ws.plan, quotaThreshold),
      };
    });

    return NextResponse.json({ success: true, pools });
  } catch (error) {
    console.error("获取企业池列表失败:", error);
    return NextResponse.json({ error: "获取企业池列表失败" }, { status: 500 });
  }
}
