import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function POST(request: NextRequest) {
  try {
    const { phone, code, type } = await request.json();

    if (!phone || !code) {
      return NextResponse.json(
        { message: "手机号和验证码不能为空" },
        { status: 400 }
      );
    }

    // 查找最近的验证码记录（5 分钟内）
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const smsRecord = await prisma.smsCode.findFirst({
      where: {
        phone: phone,
        code: code,
        type: type || "reset-password",
        used: false,
        createdAt: {
          gte: fiveMinutesAgo,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (!smsRecord) {
      return NextResponse.json(
        { message: "验证码错误或已过期" },
        { status: 400 }
      );
    }

    // 标记验证码为已使用
    await prisma.smsCode.update({
      where: { id: smsRecord.id },
      data: {
        used: true,
        usedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error("Verify SMS code error:", error);
    return NextResponse.json(
      { message: "服务器错误" },
      { status: 500 }
    );
  }
}
