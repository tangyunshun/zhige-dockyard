import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json();

    // 验证 Setup Token
    const setupToken = process.env.SETUP_TOKEN;

    if (!setupToken) {
      return NextResponse.json(
        { message: "服务器未配置 SETUP_TOKEN，无法验证" },
        { status: 500 },
      );
    }

    if (token !== setupToken) {
      return NextResponse.json({ message: "Setup Token 无效" }, { status: 401 });
    }

    // 验证是否已有用户
    const userCount = await prisma.user.count();
    if (userCount > 0) {
      return NextResponse.json(
        { message: "系统已初始化，无法使用 Setup Token" },
        { status: 400 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Verify setup token error:", error);
    return NextResponse.json({ message: "验证 Setup Token 失败" }, { status: 500 });
  }
}
