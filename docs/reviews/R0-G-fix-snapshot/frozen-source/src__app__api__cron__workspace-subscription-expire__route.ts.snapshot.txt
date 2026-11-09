import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/cron/workspace-subscription-expire
 *
 * 每日定时任务：扫描「订阅已到期且未续费」的空间套餐，自动降级为免费版（STANDARD）。
 * - 重置 plan / 订阅生命周期字段；
 * - 席位上限回落到免费版自带席位；
 * - 企业算力点是否收回由 RECLAIM_ENTERPRISE_POINTS_ON_EXPIRY 控制（默认 false，保留用户剩余点数，仅收回更高额度权益）。
 *   （如需严格按需求「收回未使用的企业算力点」，置为 true。）
 * - 「超员成员冻结」需要 workspacemember 增加 status 字段并在邀请/执行处做冻结校验，本任务暂不处理，列为后续项。
 *
 * 安全：若配置了 CRON_SECRET，则要求请求头 x-cron-key 与之匹配；未配置时（开发环境）放行。
 */
const RECLAIM_ENTERPRISE_POINTS_ON_EXPIRY =
  process.env.RECLAIM_ENTERPRISE_POINTS_ON_EXPIRY === "true";

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const key = request.headers.get("x-cron-key");
    if (key !== secret) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const now = new Date();
  const affected: any[] = [];

  try {
    // 免费版自带席位（与 workspaceplan STANDARD.maxMembers 保持一致）
    const std = await prisma.workspaceplan.findUnique({ where: { key: "STANDARD" } });
    const stdSeats = BigInt(std?.maxMembers ?? 2);

    const expired = await prisma.workspace.findMany({
      where: {
        plan: { not: "STANDARD" },
        planExpiresAt: { not: null, lt: now },
      },
      select: { id: true, name: true, plan: true, workspacequotaId: true },
    });

    for (const ws of expired) {
      await prisma.$transaction(async (tx) => {
        await tx.workspace.update({
          where: { id: ws.id },
          data: {
            plan: "STANDARD",
            planStartedAt: null,
            planExpiresAt: null,
            planBillingCycle: null,
            extraSeats: 0,
            updatedAt: new Date(),
          },
        });

        if (ws.workspacequotaId) {
          await tx.workspacequota.update({
            where: { id: ws.workspacequotaId },
            data: {
              enterpriseSlots: stdSeats,
              ...(RECLAIM_ENTERPRISE_POINTS_ON_EXPIRY ? { tokenBalance: BigInt(0) } : {}),
              updatedAt: new Date(),
            },
          });
        }
      });

      affected.push({ id: ws.id, name: ws.name, fromPlan: ws.plan, toPlan: "STANDARD" });
    }

    return NextResponse.json({
      success: true,
      checkedAt: now.toISOString(),
      downgraded: affected.length,
      reclaimedPoints: RECLAIM_ENTERPRISE_POINTS_ON_EXPIRY,
      affected,
    });
  } catch (error) {
    console.error("Cron workspace subscription expire error:", error);
    return NextResponse.json(
      { error: "定时降级执行失败", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}
