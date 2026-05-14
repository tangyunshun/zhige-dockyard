﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getToken } from "next-auth/jwt";

const prisma = new PrismaClient();

// 清空工作空间数据
export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req });
    if (!token?.id) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const userId = token.id as string;
    const { workspaceId, confirmText } = await req.json();

    // 验证确认文本
    if (confirmText !== "确认删除") {
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

    // 验证用户是否有权限管理该工作空间
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
        { error: "无权管理该工作空间" },
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

    // 个人空间不能清空数据
    if (workspace.type === "PERSONAL") {
      return NextResponse.json(
        { error: "个人空间不能清空数据" },
        { status: 400 }
      );
    }

    // 删除工作空间的所有成员（除了 owner）
    await prisma.workspaceMember.deleteMany({
      where: {
        workspaceId,
        role: {
          not: "OWNER",
        },
      },
    });

    // 删除工作空间的所有岗位
    await prisma.workspacePost.deleteMany({
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
