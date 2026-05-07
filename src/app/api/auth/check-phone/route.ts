import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const { phone } = await request.json();

    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
      return NextResponse.json(
        { message: "手机号格式不正确" },
        { status: 400 },
      );
    }

    // 检查手机号是否已注册
    const user = await prisma.user.findUnique({
      where: { phone },
      select: {
        id: true,
        phone: true,
        name: true,
      },
    });

    if (user) {
      return NextResponse.json({
        registered: true,
        message: "手机号已注册，可直接登录",
      });
    }

    return NextResponse.json({
      registered: false,
      message: "手机号未注册",
    });
  } catch (error) {
    console.error("Check phone error:", error);
    return NextResponse.json({ message: "检查手机号失败" }, { status: 500 });
  }
}
