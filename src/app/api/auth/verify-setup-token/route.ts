import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json();

    // 验证 SETUP_TOKEN
    const setupToken = process.env.SETUP_TOKEN;

    if (!setupToken) {
      return NextResponse.json(
        { message: "服务器未配置 SETUP_TOKEN，请联系管理员" },
        { status: 500 },
      );
    }

    if (token !== setupToken) {
      return NextResponse.json({ message: "安装令牌无效" }, { status: 401 });
    }

    // 验证系统是否已经初始化
    const userCount = await prisma.user.count();
    if (userCount > 0) {
      return NextResponse.json(
        { message: "系统已初始化，无需重复操作" },
        { status: 400 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Verify setup token error:", error);
    return NextResponse.json({ message: "服务器错误" }, { status: 500 });
  }
}
