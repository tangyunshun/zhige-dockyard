import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// 获取企业空间配额
async function getEnterpriseQuota(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    return {
      hasEnterprise: false,
      enterpriseCount: 0,
      maxEnterprise: 1,
      isMember: false,
    };
  }

  const enterpriseWorkspaces = await prisma.workspace.findMany({
    where: {
      ownerId: userId,
      type: "ENTERPRISE",
    },
  });

  const isMember = user.role === "admin" || user.role === "super_admin";
  const maxEnterprise = isMember ? 3 : 1;

  return {
    hasEnterprise: enterpriseWorkspaces.length > 0,
    enterpriseCount: enterpriseWorkspaces.length,
    maxEnterprise,
    isMember,
  };
}

// GET: 获取工作空间信息和配额
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (
      !authHeader ||
      authHeader === "Bearer null" ||
      authHeader === "Bearer "
    ) {
      return NextResponse.json({ error: "未授权访问" }, { status: 401 });
    }

    const userId = authHeader.replace("Bearer ", "");
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json({ error: "缺少工作空间 ID" }, { status: 400 });
    }

    // 获取个人空间信息
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) {
      return NextResponse.json({ error: "工作空间不存在" }, { status: 404 });
    }

    if (workspace.type !== "PERSONAL") {
      return NextResponse.json({ error: "只能升级个人空间" }, { status: 400 });
    }

    if (workspace.ownerId !== userId) {
      return NextResponse.json({ error: "无权限操作此空间" }, { status: 403 });
    }

    // 获取配额信息
    const quota = await getEnterpriseQuota(userId);

    return NextResponse.json({
      workspace: {
        id: workspace.id,
        name: workspace.name,
        description: workspace.description,
        createdAt: workspace.createdAt,
      },
      quota,
    });
  } catch (error) {
    console.error("Get upgrade info error:", error);
    return NextResponse.json(
      {
        error: "获取信息失败",
        details: error instanceof Error ? error.message : error,
      },
      { status: 500 },
    );
  }
}

// POST: 执行升级操作
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (
      !authHeader ||
      authHeader === "Bearer null" ||
      authHeader === "Bearer "
    ) {
      return NextResponse.json({ error: "未授权访问" }, { status: 401 });
    }

    const userId = authHeader.replace("Bearer ", "");
    const body = await request.json();
    const { workspaceId, option } = body;

    console.log("=== 升级 API 被调用 ===");
    console.log("userId:", userId);
    console.log("workspaceId:", workspaceId);
    console.log("option:", option);

    if (!workspaceId || !option) {
      return NextResponse.json({ error: "缺少必要参数" }, { status: 400 });
    }

    if (!["retain", "delete", "upgrade"].includes(option)) {
      return NextResponse.json({ error: "无效的升级选项" }, { status: 400 });
    }

    // 获取个人空间
    const personalWorkspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!personalWorkspace) {
      return NextResponse.json({ error: "工作空间不存在" }, { status: 404 });
    }

    if (personalWorkspace.type !== "PERSONAL") {
      return NextResponse.json(
        { error: "只能升级个人空间，当前空间类型为企业空间" },
        { status: 400 },
      );
    }

    if (personalWorkspace.ownerId !== userId) {
      return NextResponse.json({ error: "无权限操作此空间" }, { status: 403 });
    }

    // 检查配额
    const quota = await getEnterpriseQuota(userId);
    if (quota.enterpriseCount >= quota.maxEnterprise) {
      return NextResponse.json(
        {
          error: quota.isMember
            ? "会员用户最多只能拥有 3 个企业空间"
            : "免费用户只能拥有 1 个企业空间",
        },
        { status: 403 },
      );
    }

    // 如果选择删除个人空间，先进行检测
    if (option === "delete") {
      // 1. 检查是否有其他成员（除了所有者）
      const members = await prisma.workspaceMember.findMany({
        where: { workspaceId },
        include: { user: true },
      });

      const otherMembers = members.filter((m: any) => m.userId !== userId);
      if (otherMembers.length > 0) {
        return NextResponse.json(
          {
            error: `空间还有 ${otherMembers.length} 名成员，需要先移除或转移所有权`,
          },
          { status: 400 },
        );
      }

      // 2. 检查组件任务（通过 tenantId 查询）
      const inProgressTasks = await prisma.componenttask.count({
        where: {
          tenantId: workspaceId,
          status: "IN_PROGRESS",
        },
      });

      const completedTasks = await prisma.componenttask.count({
        where: {
          tenantId: workspaceId,
          status: "COMPLETED",
        },
      });

      if (inProgressTasks > 0) {
        return NextResponse.json(
          {
            error: `空间有 ${inProgressTasks} 个进行中的组件任务，需要先完成或取消`,
          },
          { status: 400 },
        );
      }

      if (completedTasks > 0) {
        return NextResponse.json(
          { error: `空间有 ${completedTasks} 个已完成的组件，删除后将不可用` },
          { status: 400 },
        );
      }

      // 3. 检查项目
      const projectCount = await prisma.project.count({
        where: { workspaceId },
      });

      if (projectCount > 0) {
        return NextResponse.json(
          { error: `空间还有 ${projectCount} 个项目，需要先删除或转移` },
          { status: 400 },
        );
      }
    }

    let resultWorkspaceId = workspaceId;
    let message = "";

    // 根据选项执行不同的升级逻辑
    if (option === "upgrade") {
      // 选项 C：直接升级（数据迁移）
      await prisma.workspace.update({
        where: { id: workspaceId },
        data: { type: "ENTERPRISE" },
      });

      message = "空间已成功升级为企业空间";
    } else if (option === "retain" || option === "delete") {
      // 选项 A 或 B：创建新的企业空间
      console.log("开始创建企业空间...");
      console.log("个人空间信息:", {
        name: personalWorkspace.name,
        description: personalWorkspace.description,
        ownerId: userId,
      });

      const newWorkspace = await prisma.workspace.create({
        data: {
          name: personalWorkspace.name,
          description: personalWorkspace.description,
          type: "ENTERPRISE",
          ownerId: userId,
          members: {
            create: {
              userId,
              role: "OWNER",
            },
          },
        },
      });

      console.log("企业空间创建成功:", newWorkspace.id);
      resultWorkspaceId = newWorkspace.id;

      // 如果选择删除个人空间
      if (option === "delete") {
        console.log("选项 B：开始删除个人空间", workspaceId);
        // 删除个人空间的成员关系
        await prisma.workspaceMember.deleteMany({
          where: { workspaceId },
        });
        console.log("成员关系已删除");

        // 删除个人空间
        await prisma.workspace.delete({
          where: { id: workspaceId },
        });
        console.log("个人空间已删除");

        message = "企业空间创建成功，原个人空间已删除";
      } else {
        message = "企业空间创建成功，个人空间已保留";
      }
    }

    // 记录操作日志
    await prisma.operationLog.create({
      data: {
        userId,
        workspaceId: resultWorkspaceId,
        action: "UPGRADE_WORKSPACE",
        resource: "Workspace",
        details: {
          fromType: "PERSONAL",
          toType: "ENTERPRISE",
          option,
        },
      },
    });

    return NextResponse.json({
      success: true,
      message,
      workspaceId: resultWorkspaceId,
    });
  } catch (error) {
    console.error("Upgrade workspace error:", error);
    return NextResponse.json(
      {
        error: "升级失败",
        details: error instanceof Error ? error.message : error,
      },
      { status: 500 },
    );
  }
}
