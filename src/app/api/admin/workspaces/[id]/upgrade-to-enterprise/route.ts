import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminRole, validateUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/security";
import { upgradePersonalToEnterprise } from "@/lib/workspace-upgrade-service";

/**
 * POST /api/admin/workspaces/[id]/upgrade-to-enterprise
 * 平台管理员手动将个人空间升级为企业空间（试运行 / 补偿 / 内部账户等场景）。
 * 仅超管 / 平台管理员可用；仅允许对 PERSONAL 空间操作（已是企业空间则幂等跳过）。
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const user = await prisma.user.findUnique({ where: { id: auth.user.id } });
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: "无权访问" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json().catch(() => ({} as any));
    const planKey = typeof body.planKey === "string" ? body.planKey : undefined;
    const billingCycle: "MONTH" | "YEAR" = body.billingCycle === "YEAR" ? "YEAR" : "MONTH";

    const workspace = await prisma.workspace.findUnique({
      where: { id },
      select: { id: true, name: true, type: true },
    });
    if (!workspace) {
      return NextResponse.json({ error: "工作空间不存在" }, { status: 404 });
    }
    if (workspace.type !== "PERSONAL") {
      return NextResponse.json(
        { error: "仅个人空间可升级为企业空间（该空间已是企业空间）" },
        { status: 400 },
      );
    }

    const result = await upgradePersonalToEnterprise({
      workspaceId: id,
      targetPlanKey: planKey,
      billingCycle,
      source: "ADMIN_MANUAL",
      actorId: user.id,
    });

    await writeAuditLog(user.id, "workspace:upgrade_enterprise", { workspaceId: id, workspaceName: workspace.name, planKey, billingCycle }, id, null, request);

    return NextResponse.json({
      success: true,
      message: `已将空间「${workspace.name}」升级为企业空间（${result.plan}）`,
      data: result,
    });
  } catch (error) {
    console.error("Admin upgrade to enterprise error:", error);
    const msg = error instanceof Error ? error.message : String(error);
    if (msg === "TARGET_PLAN_NOT_FOUND") {
      return NextResponse.json({ error: "目标企业套餐不存在" }, { status: 400 });
    }
    return NextResponse.json({ error: "升级失败", details: msg }, { status: 500 });
  }
}
