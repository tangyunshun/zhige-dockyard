import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getToken } from "next-auth/jwt";

const prisma = new PrismaClient();

// 获取用户登录历史
export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req });
    if (!token?.id) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const userId = token.id as string;
    const limit = parseInt(req.nextUrl.searchParams.get("limit") || "10");

    // 获取用户登录历史
    const loginHistory = await prisma.loginHistory.findMany({
      where: { userId },
      orderBy: { loginAt: "desc" },
      take: limit,
    });

    return NextResponse.json({ loginHistory });
  } catch (error) {
    console.error("获取登录历史错误:", error);
    return NextResponse.json(
      { error: "获取登录历史失败" },
      { status: 500 }
    );
  }
}

// 记录登录历史
export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req });
    if (!token?.id) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
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
      message: "登录记录已保存",
    });
  } catch (error) {
    console.error("保存登录历史错误:", error);
    return NextResponse.json(
      { error: "保存登录历史失败" },
      { status: 500 }
    );
  }
}
