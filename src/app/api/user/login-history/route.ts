import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getToken } from "next-auth/jwt";

const prisma = new PrismaClient();

// 获取用户的登录历史
export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req });
    if (!token?.id) {
      return NextResponse.json({ error: "未授权访问" }, { status: 401 });
    }

    const userId = token.id as string;
    const limit = parseInt(req.nextUrl.searchParams.get("limit") || "10");

    // 获取最近登录历史
    const loginHistory = await prisma.loginHistory.findMany({
      where: { userId },
      orderBy: { loginAt: "desc" },
      take: limit,
    });

    return NextResponse.json({ loginHistory });
  } catch (error) {
    console.error("获取登录历史失败:", error);
    return NextResponse.json(
      { error: "获取失败，请稍后重试" },
      { status: 500 }
    );
  }
}

// 记录用户登录
export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req });
    if (!token?.id) {
      return NextResponse.json({ error: "未授权访问" }, { status: 401 });
    }

    const userId = token.id as string;
    const { ipAddress, userAgent, location, device } = await req.json();

    // 创建登录历史记录
    await prisma.loginHistory.create({
      data: {
        userId,
        ipAddress: ipAddress || "",
        userAgent: userAgent || "",
        location: location || "",
        device: device || "",
        loginAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      message: "登录历史已记录",
    });
  } catch (error) {
    console.error("记录登录历史失败:", error);
    return NextResponse.json(
      { error: "记录失败，请稍后重试" },
      { status: 500 }
    );
  }
}
