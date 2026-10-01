import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformPermission } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    // 调试接口：收敛为平台管理员权限点（原先仅登录态即可访问，属越权面）
    const permCheck = await requirePlatformPermission(request, "post:read");
    if (!permCheck.authorized) {
      return permCheck.errorResponse || NextResponse.json({ error: "无权访问" }, { status: 403 });
    }
    const allWorkspaces = await prisma.workspace.findMany({
      select: { id: true, name: true, description: true },
    });

    const allWorkspacePosts = await prisma.workspacepost.findMany({
      include: {
        workspace: { select: { id: true, name: true } },
        _count: { select: { postmember: true } },
      },
    });

    const allPositions = await prisma.position.findMany({
      select: { id: true, name: true, code: true },
    });

    const allTenants = await prisma.tenant.findMany({
      select: { id: true, name: true },
    });

    const allWorkspaceMembers = await prisma.workspacemember.findMany({
      take: 20,
      select: {
        workspaceId: true,
        userId: true,
        role: true,
        user: { select: { name: true, email: true } },
      },
    });

    return NextResponse.json({
      workspaces: allWorkspaces,
      workspacePosts: allWorkspacePosts,
      positions: allPositions,
      tenants: allTenants,
      sampleMembers: allWorkspaceMembers,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, stack: err.stack }, { status: 500 });
  }
}
