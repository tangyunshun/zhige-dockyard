import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformAuth, requirePlatformPermission } from "@/lib/security";

/**
 * 管理员后台「待审核事项」统一聚合
 * 汇总当前需要管理员处理（审核 / 审批）的全部事项，按分类返回：
 * 每个分类含 key（用于前端识别）、label（展示名）、href（跳转路径）、count（待处理数量）。
 * 左侧菜单与顶部汇总条据此渲染红色数字角标与快速跳转入口。
 *
 * 权限处理：
 * - 接口基础权限要求具备 order:read ∨ user:read ∨ appeal:read 之一；
 * - 财务类（充值 / 退款 / 额度提升）仅对持有 order:read 的管理员展示；
 * - 岗位提报需 post:read；账号申诉需 appeal:read；
 * - 定制咨询 / 演示申请无额外权限门槛，全部管理员可见。
 * 与左侧菜单的可见性保持一致：无权限的分类既不展示菜单，也不展示角标。
 */
const CATEGORIES = [
  { key: "posts", label: "岗位提报审核", href: "/admin/posts", perm: "post:read" },
  { key: "appeals", label: "账号申诉", href: "/admin/account-appeals", perm: "appeal:read" },
  { key: "rechargeOrders", label: "充值工单审批", href: "/admin/finance/recharge-orders", perm: "order:read" },
  { key: "refundRequests", label: "退款申请审批", href: "/admin/finance/refund-requests", perm: "order:read" },
  { key: "quotaApply", label: "额度提升审批", href: "/admin/quota-apply", perm: "order:read" },
  { key: "upgradeApplications", label: "定制咨询处理", href: "/admin/upgrade-applications", perm: null },
  { key: "demoRequests", label: "演示申请", href: "/admin/demo-requests", perm: null },
] as const;

export async function GET(request: NextRequest) {
  try {
    const authResult = await requirePlatformAuth(request);
    if (!authResult.authorized) {
      return authResult.errorResponse!;
    }

    // 基础权限门槛：避免仅靠登录态即可读取运营待办数据
    const baseCheck = await requirePlatformPermission(request, "order:read", "user:read", "appeal:read");
    if (!baseCheck.authorized) {
      return baseCheck.errorResponse || NextResponse.json({ error: "无权限查看后台待办" }, { status: 403 });
    }

    // 一次性聚合各分类的待处理数量（不依赖权限，全量统计）
    const [
      appeals,
      rechargeOrders,
      refundRequests,
      quotaApplies,
      upgradeApplications,
      demoRequests,
      submittedPostsCfg,
    ] = await Promise.all([
      prisma.accountappeal.count({ where: { status: "pending" } }),
      prisma.tokenrechargeorder.count({ where: { status: "PENDING" } }),
      prisma.refundrequest.count({ where: { status: "PENDING" } }),
      prisma.quotaapply.count({ where: { status: "PENDING" } }),
      prisma.upgradeapplication.count({ where: { status: "PENDING" } }),
      prisma.demorequest.count({ where: { status: "pending" } }),
      prisma.systemconfig.findUnique({ where: { key: "PLATFORM_WORKSPACE_SUBMITTED_POSTS_V1" } }),
    ]);

    const postSubmissions = submittedPostsCfg?.value
      ? (JSON.parse(submittedPostsCfg.value) as Array<{ status: string }>).filter(
          (i) => i.status === "PENDING"
        ).length
      : 0;

    const rawCounts: Record<string, number> = {
      posts: postSubmissions,
      appeals,
      rechargeOrders,
      refundRequests,
      quotaApply: quotaApplies,
      upgradeApplications,
      demoRequests,
    };

    // 按权限过滤可见分类（与左侧菜单可见性一致）
    const items: { key: string; label: string; href: string; count: number }[] = [];
    for (const cat of CATEGORIES) {
      if (cat.perm) {
        const permCheck = await requirePlatformPermission(request, cat.perm);
        if (!permCheck.authorized) continue;
      }
      items.push({
        key: cat.key,
        label: cat.label,
        href: cat.href,
        count: rawCounts[cat.key] || 0,
      });
    }

    const total = items.reduce((sum, i) => sum + i.count, 0);

    return NextResponse.json({
      success: true,
      total,
      items,
    });
  } catch (error) {
    console.error("Get admin pending tasks error:", error);
    return NextResponse.json(
      { error: "获取待审核统计失败", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}
