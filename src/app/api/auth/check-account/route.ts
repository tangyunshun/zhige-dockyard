import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const { account } = await request.json();

    if (!account) {
      return NextResponse.json(
        { message: "账号不能为空" },
        { status: 400 }
      );
    }

    // 查找用户（支持邮箱/手机号/账号名）
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: account }, { phone: account }, { name: account }],
      },
      select: {
        id: true,
        email: true,
        phone: true,
        name: true,
        status: true,
        loginAttempts: true,
        lockedUntil: true,
      },
    });

    if (!user) {
      return NextResponse.json({
        exists: false,
        message: "该账号未注册",
      });
    }

    // 检查账号状态
    if (user.status !== "active") {
      return NextResponse.json({
        exists: true,
        status: "disabled",
        message: "该账号已被禁用",
      });
    }

    // 检查是否被锁定
    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      const minutes = Math.ceil(
        (user.lockedUntil.getTime() - Date.now()) / 60000
      );
      return NextResponse.json({
        exists: true,
        status: "locked",
        lockedUntil: user.lockedUntil,
        minutesRemaining: minutes,
        message: `账号已锁定，请${minutes}分钟后再试`,
      });
    }

    return NextResponse.json({
      exists: true,
      status: "active",
      message: "账号存在",
    });
  } catch (error) {
    console.error("Check account error:", error);
    return NextResponse.json(
      { message: "服务器错误" },
      { status: 500 }
    );
  }
}
