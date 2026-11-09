import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformPermission } from "@/lib/security";

/**
 * 诊断入口：仅平台授权可访问，绝不向匿名/普通用户暴露私有数据。
 * 保留最小诊断数据；未授权一律 403，不返回任何业务/用户材料。
 */
export async function GET(request: Request) {
  const auth = await requirePlatformPermission(request as any, "system:manage", "debug:read");
  if (!auth.authorized) {
    return auth.errorResponse || NextResponse.json({ success: false, error: "无权限" }, { status: 403 });
  }
  try {
    const wsPersonal = "ws-personal-1787924572254-wu6kio";
    const wsEnterprise = "ws-enterprise-1787927954618-9arzol";

    const quotas = await prisma.workspacequota.findMany({
      where: {
        workspaceId: { in: [wsPersonal, wsEnterprise] }
      },
      include: {
        membershiplevel: true
      }
    });

    const members = await prisma.workspacemember.findMany({
      where: {
        workspaceId: wsEnterprise
      },
      include: {
        user: { select: { id: true, name: true, email: true } }
      }
    });

    const safeJson = JSON.parse(
      JSON.stringify(
        {
          success: true,
          quotas,
          enterpriseMembers: members,
        },
        (key, value) => (typeof value === "bigint" ? value.toString() : value)
      )
    );

    return NextResponse.json(safeJson);
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
}
