import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    // 获取当前用户
    const authHeader = request.headers.get("authorization");
    if (!authHeader || authHeader === "Bearer null" || authHeader === "Bearer ") {
      return NextResponse.json({ error: "未授权访问" }, { status: 401 });
    }

    const userId = authHeader.replace("Bearer ", "");
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    // 解析请求体
    const body = await request.json();
    const { name, description } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "空间名称不能为空" }, { status: 400 });
    }

    // 检查用户的企业空间配额
    const enterpriseWorkspaces = await prisma.workspace.findMany({
      where: {
        ownerId: userId,
        type: "ENTERPRISE",
      },
    });

    // 检查会员状态（简化版本：通过用户角色判断）
    const isMember = user.role === "admin" || user.role === "super_admin";
    const maxEnterprise = isMember ? 3 : 1;

    if (enterpriseWorkspaces.length >= maxEnterprise) {
      return NextResponse.json(
        { 
          error: isMember 
            ? "会员用户最多只能创建 3 个企业空间" 
            : "免费用户只能创建 1 个企业空间，如需更多请升级会员" 
        },
        { status: 403 }
      );
    }

    // 创建企业空间
    const workspace = await prisma.workspace.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        type: "ENTERPRISE",
        ownerId: userId,
        members: {
          create: {
            userId,
            role: "OWNER",
          },
        },
      },
      include: {
        members: true,
      },
    });

    // 记录操作日志
    await prisma.operationLog.create({
      data: {
        userId,
        workspaceId: workspace.id,
        action: "CREATE_ENTERPRISE_WORKSPACE",
        resource: "Workspace",
        details: {
          workspaceName: name,
          workspaceType: "ENTERPRISE",
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: "企业空间创建成功",
      workspace,
    });
  } catch (error) {
    console.error("Create enterprise workspace error:", error);
    return NextResponse.json(
      { error: "创建失败", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}
