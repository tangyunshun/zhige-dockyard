import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyJWT } from "@/lib/auth";

// 修改用户账号状态
export async function PATCH(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    // 验证管理员权限
    const token = request.headers.get("authorization")?.split(" ")[1];
    if (!token) {
      return NextResponse.json(
        { message: "未授权访问" },
        { status: 401 }
      );
    }

    const payload = await verifyJWT(token);
    if (!payload || payload.role !== "admin") {
      return NextResponse.json(
        { message: "权限不足" },
        { status: 403 }
      );
    }

    const { status } = await request.json();

    // 验证状态值
    const validStatuses = ["active", "inactive", "banned"];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { message: "无效的状态值" },
        { status: 400 }
      );
    }

    // 更新用户状态
    const updatedUser = await prisma.user.update({
      where: { id: params.userId },
      data: { status },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        status: true,
        role: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: updatedUser,
      message: getStatusMessage(status),
    });
  } catch (error) {
    console.error("Update user status error:", error);
    return NextResponse.json(
      { message: "服务器错误" },
      { status: 500 }
    );
  }
}

function getStatusMessage(status: string): string {
  switch (status) {
    case "active":
      return "账号已激活";
    case "inactive":
      return "账号已停用";
    case "banned":
      return "账号已被封禁";
    default:
      return "状态已更新";
  }
}
