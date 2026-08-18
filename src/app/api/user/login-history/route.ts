import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// 获取用户登录历史
export async function GET(req: NextRequest) {
  try {
    // middleware 已校验 JWT 并把真实 userId 注入 x-user-id
    const userId =
      req.headers.get("x-user-id") ||
      req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!userId) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const limit = parseInt(req.nextUrl.searchParams.get("limit") || "10");

    // 获取用户登录历史
    const loginHistory = await prisma.loginhistory.findMany({
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
      // middleware 已校验 JWT 并把真实 userId 注入 x-user-id
      const userId =
        req.headers.get("x-user-id") ||
        req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!userId) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const { ipAddress, userAgent, location, device } = await req.json();

    // 创建登录历史记录
    await prisma.loginhistory.create({
      data: {
        id: crypto.randomUUID(),
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
