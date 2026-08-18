import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

/** GET: 获取单个工作空间详情（编辑/扩容模式使用） */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const authResult = await validateUser(authHeader, request);

    if (!authResult.valid) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const userId = authResult.user!.id;
    const workspaceId = request.nextUrl.searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json({ error: "缺少工作空间 ID" }, { status: 400 });
    }

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        workspacemember: {
          where: { userId },
          select: { role: true },
        },
      },
    });

    if (!workspace) {
      return NextResponse.json({ error: "工作空间不存在" }, { status: 404 });
    }

    const isOwner = workspace.ownerId === userId;
    const member = workspace.workspacemember[0];
    const isAdmin = member?.role === "ADMIN";

    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: "无权限查看此空间" }, { status: 403 });
    }

    return NextResponse.json({
      workspace: {
        id: workspace.id,
        name: workspace.name,
        description: workspace.description,
        type: workspace.type,
        teamSize: workspace.teamSize,
        industry: workspace.industry,
        contactEmail: workspace.contactEmail,
        contactPhone: workspace.contactPhone,
        plan: workspace.plan,
        visibility: workspace.visibility,
        logo: workspace.logo,
        createdAt: workspace.createdAt,
      },
    });
  } catch (error) {
    console.error("Get workspace info error:", error);
    return NextResponse.json(
      { error: "获取工作空间信息失败" },
      { status: 500 },
    );
  }
}
