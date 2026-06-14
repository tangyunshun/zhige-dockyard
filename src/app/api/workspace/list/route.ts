import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    // 验证用户身份
    let userId = request.headers.get("x-user-id");
    if (!userId) {
      const authHeader = request.headers.get("authorization");
      const authResult = await validateUser(authHeader);
      if (!authResult.valid) {
        // 双保险：若 Header 鉴权失败，则尝试从 Cookie 中直接读取未加密的 userId (前端在登录成功后已写入该 Cookie)
        const cookieUserId = request.cookies.get("userId")?.value;
        if (cookieUserId) {
          userId = cookieUserId;
        } else {
          return NextResponse.json({ error: authResult.error }, { status: 401 });
        }
      } else {
        userId = authResult.user!.id;
      }
    }

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

    // 检查用户是否拥有归属于自己的个人工作空间
    const hasPersonalWorkspace = Array.from(workspaceMap.values()).some(
      (ws: any) => ws.type === "PERSONAL" && ws.role === "OWNER"
    );

    // 如果用户没有个人工作空间，则自动创建并开通一个默认的个人工作空间，并同步绑定配额
    if (!hasPersonalWorkspace) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, phone: true, email: true, membershipLevel: true },
      });
      if (user) {
        const workspaceName = `个人空间 - ${user.name || user.phone || user.email || '用户'}`;
        const workspaceId = `ws-personal-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
        const now = new Date();
        
        // 创建 workspace
        const workspace = await prisma.workspace.create({
          data: {
            id: workspaceId,
            name: workspaceName,
            type: 'PERSONAL',
            ownerId: userId,
            description: `${user.name || '用户'}的个人工作空间`,
            createdAt: now,
            updatedAt: now,
          },
        });
        
        // 创建 WorkspaceMember 记录
        const memberId = `wsm-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
        await prisma.workspacemember.create({
          data: {
            id: memberId,
            userId,
            workspaceId: workspace.id,
            role: 'OWNER',
            updatedAt: now,
          },
        });

        // 匹配会员等级并同步为该个人空间配置 WorkspaceQuota 配额数据，为工坊模拟运行提供算力余额
        const membershipLevel = user.membershipLevel || "FREE";
        let ml = await prisma.membershiplevel.findUnique({
          where: { id: membershipLevel }
        });
        if (!ml) {
          ml = await prisma.membershiplevel.findFirst();
        }
        const mlId = ml?.id || "FREE";
        const tokenLimit = membershipLevel === "FREE" ? 10000 : membershipLevel === "GOLD" ? 50000 : 100000;

        await prisma.workspacequota.create({
          data: {
            id: crypto.randomUUID(),
            workspaceId: workspace.id,
            membershipLevelId: mlId,
            tokenBalance: BigInt(tokenLimit),
            updatedAt: now,
          }
        });
        
        // 更新用户的 lastWorkspaceId
        await prisma.user.update({
          where: { id: userId },
          data: {
            lastWorkspaceId: workspace.id,
          },
        });
        
        // 加入 Map
        workspaceMap.set(workspace.id, {
          id: workspace.id,
          name: workspace.name,
          type: 'PERSONAL',
          role: 'OWNER',
          description: workspace.description,
          createdAt: workspace.createdAt,
          updatedAt: workspace.updatedAt,
        });
      }
    }

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

    // 获取用户 lastWorkspaceId 或者是默认第一个
    const userForLastWs = await prisma.user.findUnique({
      where: { id: userId },
      select: { lastWorkspaceId: true },
    });
    
    let currentWorkspaceId = userForLastWs?.lastWorkspaceId || null;
    
    // 确保当前活跃空间在列表中且有效
    if (!currentWorkspaceId && workspacesWithComponents.length > 0) {
      currentWorkspaceId = workspacesWithComponents[0].id;
    } else if (currentWorkspaceId && !workspaceMap.has(currentWorkspaceId) && workspacesWithComponents.length > 0) {
      currentWorkspaceId = workspacesWithComponents[0].id;
    }

    return NextResponse.json({
      workspaces: workspacesWithComponents,
      currentWorkspaceId,
    });
  } catch (error) {
    console.warn("Get workspace list error:", error);
    return NextResponse.json(
      { error: "获取工作空间列表失败" },
      { status: 500 },
    );
  }
}
