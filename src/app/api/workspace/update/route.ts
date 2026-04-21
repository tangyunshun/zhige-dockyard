import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getToken } from "next-auth/jwt";

const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req });
    if (!token?.id) {
      return NextResponse.json({ error: "未授权访问" }, { status: 401 });
    }

    const userId = token.id as string;
    const { workspaceId, name, description, emoji } = await req.json();

    if (!workspaceId) {
      return NextResponse.json(
        { error: "请提供工作空间 ID" },
        { status: 400 }
      );
    }

    // 验证用户是否有权修改此工作空间
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
        { error: "无权修改此工作空间" },
        { status: 403 }
      );
    }

    const updateData: any = {};
    if (name) updateData.name = name;
    if (description) updateData.description = description;
    if (emoji) updateData.emoji = emoji;

    await prisma.workspace.update({
      where: { id: workspaceId },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      message: "工作空间配置已更新",
    });
  } catch (error) {
    console.error("更新工作空间失败:", error);
    return NextResponse.json(
      { error: "更新失败，请稍后重试" },
      { status: 500 }
    );
  }
}
