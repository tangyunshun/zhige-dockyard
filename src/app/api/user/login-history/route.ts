import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { validateUser } from "@/lib/auth";

const prisma = new PrismaClient();

// 获取用户登录历史
export async function GET(req: NextRequest) {
  try {
    // 统一走合法 JWT 校验，禁止信任客户端伪造的 x-user-id 或明文 userId
    const auth = await validateUser(req.headers.get("Authorization"), req);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const userId = auth.user.id;

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
      // 统一走合法 JWT 校验，禁止信任客户端伪造的 x-user-id 或明文 userId
      const auth = await validateUser(req.headers.get("Authorization"), req);
      if (!auth.valid || !auth.user) {
        return NextResponse.json({ error: "未授权" }, { status: 401 });
      }
      const userId = auth.user.id;

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
