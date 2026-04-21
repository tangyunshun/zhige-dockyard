import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getToken } from "next-auth/jwt";

const prisma = new PrismaClient();

// 清空用户个人空间的所有数据
export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req });
    if (!token?.id) {
      return NextResponse.json({ error: "未授权访问" }, { status: 401 });
    }

    const userId = token.id as string;
    const { workspaceId, confirmText } = await req.json();

    // 验证确认文本
    if (confirmText !== "确认清空") {
      return NextResponse.json(
        { error: "确认文本不正确" },
        { status: 400 }
      );
    }

    // 验证工作空间 ID
    if (!workspaceId) {
      return NextResponse.json(
        { error: "请提供工作空间 ID" },
        { status: 400 }
      );
    }

    // 验证用户是否有权清空此工作空间
    const membership = await prisma.workspaceMember.findFirst({
      where: {
        userId,
        workspaceId,
        role: {
          in: ["OWNER", "ADMIN"],
        },
      },
    });

    if (!membership) {
      return NextResponse.json(
        { error: "无权操作此工作空间" },
        { status: 403 }
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

    // 只能清空 PERSONAL 类型的工作空间
    if (workspace.type !== "PERSONAL") {
      return NextResponse.json(
        { error: "只能清空个人空间" },
        { status: 400 }
      );
    }

    // 开启事务，清空相关数据
    await prisma.$transaction(async (tx) => {
      // 删除所有文档
      await tx.document.deleteMany({
        where: { workspaceId },
      });

      // 删除所有项目
      await tx.project.deleteMany({
        where: { workspaceId },
      });

      // 删除所有资产
      await tx.asset.deleteMany({
        where: { workspaceId },
      });

      // 删除所有 AI 对话记录
      await tx.conversation.deleteMany({
        where: { workspaceId },
      });

      // 删除所有集成配置
      await tx.integration.deleteMany({
        where: { workspaceId },
      });

      // 重置工作空间的 emoji 和描述
      await tx.workspace.update({
        where: { id: workspaceId },
        data: {
          emoji: "🚀",
          description: "",
        },
      });
    });

    // 记录操作日志
    await prisma.operationLog.create({
      data: {
        userId,
        workspaceId,
        action: "CLEAR_DATA",
        description: "用户清空了个人空间的所有数据",
        timestamp: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      message: "数据已清空",
    });
  } catch (error) {
    console.error("清空数据失败:", error);
    return NextResponse.json(
      { error: "清空数据失败，请稍后重试" },
      { status: 500 }
    );
  }
}
