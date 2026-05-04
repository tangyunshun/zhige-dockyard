import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function POST(request: NextRequest) {
  try {
    const { account, accountType } = await request.json();

    if (!account) {
      return NextResponse.json(
        { message: "账号不能为空" },
        { status: 400 }
      );
    }

    // 根据账号类型查找用户
    let user;
    if (accountType === "phone") {
      user = await prisma.user.findUnique({
        where: { phone: account },
      });
    } else if (accountType === "email") {
      user = await prisma.user.findUnique({
        where: { email: account },
      });
    } else if (accountType === "username") {
      user = await prisma.user.findFirst({
        where: { name: account },
      });
    } else {
      // 尝试所有类型
      user = await prisma.user.findFirst({
        where: {
          OR: [
            { phone: account },
            { email: account },
            { name: account },
          ],
        },
      });
    }

    if (!user) {
      return NextResponse.json(
        { message: "账号不存在" },
        { status: 404 }
      );
    }

    // 返回用户的绑定信息
    const bindInfo = {
      hasPhone: !!user.phone,
      hasEmail: !!user.email,
      phone: user.phone ? user.phone.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2") : undefined,
      email: user.email ? user.email.replace(/(.{2}).+(@.+)/, "$1***$2") : undefined,
    };

    return NextResponse.json({
      bindInfo,
    });
  } catch (error) {
    console.error("Check account for reset error:", error);
    return NextResponse.json(
      { message: "服务器错误" },
      { status: 500 }
    );
  }
}
