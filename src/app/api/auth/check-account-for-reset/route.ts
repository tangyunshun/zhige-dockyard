import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const { account } = await request.json();

    if (!account) {
      return NextResponse.json(
        { message: "缺少账号信息" },
        { status: 400 }
      );
    }

    // 查找用户
    let user;
    const isPhone = /^1[3-9]\d{9}$/.test(account);
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account);

    if (isPhone) {
      user = await prisma.user.findUnique({
        where: { phone: account },
      });
    } else if (isEmail) {
      user = await prisma.user.findUnique({
        where: { email: account },
      });
    } else {
      // 用户名
      user = await prisma.user.findFirst({
        where: { name: account },
      });
    }

    if (!user) {
      return NextResponse.json(
        { message: "用户不存在" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        phone: user.phone,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error) {
    console.error("Check account error:", error);
    return NextResponse.json(
      { message: "查询失败" },
      { status: 500 }
    );
  }
}
