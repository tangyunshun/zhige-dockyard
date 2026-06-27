import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

// 清空工作空间数据
export async function POST(req: NextRequest) {
  try {
    // 验证用户身份
    const authHeader = req.headers.get("authorization");
    const authResult = await validateUser(authHeader);
    
    if (!authResult.valid) {
      return NextResponse.json(
        { error: authResult.error || "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    const userId = authResult.user!.id;
    const { workspaceId, confirmText } = await req.json();

    // 验证确认文本
    if (confirmText !== "确认删除" && confirmText !== "确认重置") {
      return NextResponse.json(
        { error: "确认文本不正确" },
        { status: 400 }
      );
    }

    // 验证工作空间 ID
    if (!workspaceId) {
      return NextResponse.json(
        { error: "缺少工作空间 ID" },
        { status: 400 }
      );
    }

    // 获取工作空间信息
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) {
      return NextResponse.json(
        { error: "工作空间不存在" },
        { status: 404 }
      );
    }

    // 验证用户是否有权限管理该工作空间 (Owner 拥有绝对权限，或者在 workspacemember 中是 OWNER/ADMIN)
    const isOwner = workspace.ownerId === userId;
    let isAuthorized = isOwner;

    if (!isAuthorized) {
      const membership = await prisma.workspacemember.findFirst({
        where: {
          userId,
          workspaceId,
          role: {
            in: ["OWNER", "ADMIN"],
          },
        },
      });
      if (membership) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return NextResponse.json(
        { error: "无权管理该工作空间" },
        { status: 403 }
      );
    }

    // 如果是个人空间，只重置关联数据而不禁用该工作空间
    if (workspace.type === "PERSONAL") {
      // 删除个人空间的所有岗位
      await prisma.workspacepost.deleteMany({
        where: { workspaceId },
      });

      return NextResponse.json({
        success: true,
        message: "个人工作空间数据已成功清空重置",
      });
    }

    // 删除工作空间的所有成员（除了 owner）
    await prisma.workspacemember.deleteMany({
      where: {
        workspaceId,
        role: {
          not: "OWNER",
        },
      },
    });

    // 删除工作空间的所有岗位
    await prisma.workspacepost.deleteMany({
      where: { workspaceId },
    });

    // 更新工作空间状态为禁用
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        status: "DISABLED",
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      message: "工作空间数据已清空",
    });
  } catch (error) {
    console.error("Clear workspace data error:", error);
    return NextResponse.json(
      { error: "清空工作空间数据失败" },
      { status: 500 }
    );
  }
}
