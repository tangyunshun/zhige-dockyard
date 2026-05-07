import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    // 验证用户身份
    const authHeader = request.headers.get("authorization");
    const authResult = await validateUser(authHeader);

    if (!authResult.valid) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const userId = authResult.user!.id;

    // 查询用户的所有工作空间（包括作为成员和作为所有者的空间）
    const workspaceMembers = await prisma.workspacemember.findMany({
      where: { userId },
      include: {
        workspace: {
          select: {
            id: true,
            name: true,
            type: true,
            ownerId: true,
            description: true,
            logo: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
      orderBy: {
        joinedAt: "desc",
      },
    });

    // 同时查询用户作为所有者的工作空间（防止 workspacemember 记录缺失）
    const ownedWorkspaces = await prisma.workspace.findMany({
      where: {
        ownerId: userId,
      },
      select: {
        id: true,
        name: true,
        type: true,
        ownerId: true,
        description: true,
        logo: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // 合并两个结果集，去重
    const workspaceMap = new Map<string, any>();
    
    // 添加通过 workspacemember 查询到的工作空间
    workspaceMembers.forEach((member: any) => {
      workspaceMap.set(member.workspace.id, {
        id: member.workspace.id,
        name: member.workspace.name,
        type: member.workspace.type as "PERSONAL" | "ENTERPRISE",
        role: member.role as "OWNER" | "ADMIN" | "MEMBER",
        logo: member.workspace.logo,
        description: member.workspace.description,
        createdAt: member.workspace.createdAt,
        updatedAt: member.workspace.updatedAt,
      });
    });

    // 添加作为所有者的工作空间（如果不存在则添加）
    ownedWorkspaces.forEach((workspace: any) => {
      if (!workspaceMap.has(workspace.id)) {
        workspaceMap.set(workspace.id, {
          id: workspace.id,
          name: workspace.name,
          type: workspace.type as "PERSONAL" | "ENTERPRISE",
          role: "OWNER" as const,
          logo: workspace.logo,
          description: workspace.description,
          createdAt: workspace.createdAt,
          updatedAt: workspace.updatedAt,
        });
      }
    });

    // 获取每个工作空间的组件数量
    const workspacesWithComponents = await Promise.all(
      Array.from(workspaceMap.values()).map(async (workspace) => {
        const componentCount = await prisma.componenttask.count({
          where: {
            tenantId: workspace.id,
          },
        });

        return {
          ...workspace,
          componentCount,
        };
      }),
    );

    return NextResponse.json({
      workspaces: workspacesWithComponents,
    });
  } catch (error) {
    console.error("Get workspace list error:", error);
    return NextResponse.json(
      { error: "获取工作空间列表失败" },
      { status: 500 },
    );
  }
}
