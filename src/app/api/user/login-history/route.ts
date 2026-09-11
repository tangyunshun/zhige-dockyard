import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { validateUser } from "@/lib/auth";

const prisma = new PrismaClient();

// 获取用户登录历史（支持每页10条分页，并自动清理超期180天的数据）
export async function GET(req: NextRequest) {
  try {
    // 统一走合法 JWT 校验，禁止信任客户端伪造的 x-user-id 或明文 userId
    const auth = await validateUser(req.headers.get("Authorization"), req);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const userId = auth.user.id;

    const page = Math.max(1, parseInt(req.nextUrl.searchParams.get("page") || "1"));
    const limit = Math.max(1, parseInt(req.nextUrl.searchParams.get("limit") || "10"));

    // 核心安全合规策略：登录历史保留半年（180天），超期记录系统自动清理
    const halfYearAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
    try {
      await prisma.loginhistory.deleteMany({
        where: {
          userId,
          loginAt: { lt: halfYearAgo },
        },
      });
    } catch (cleanupErr) {
      console.warn("自动清理半年超期登录记录警告:", cleanupErr);
    }

    // 分页获取用户有效登录历史
    const [total, loginHistory] = await Promise.all([
      prisma.loginhistory.count({
        where: {
          userId,
          loginAt: { gte: halfYearAgo },
        },
      }),
      prisma.loginhistory.findMany({
        where: {
          userId,
          loginAt: { gte: halfYearAgo },
        },
        orderBy: { loginAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return NextResponse.json({
      success: true,
      loginHistory,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      retentionDays: 180,
    });
  } catch (error) {
    console.error("获取登录历史错误:", error);
    return NextResponse.json(
      { error: "获取登录历史失败" },
      { status: 500 }
    );
  }
}

// 删除单条或清空登录历史
export async function DELETE(req: NextRequest) {
  try {
    const auth = await validateUser(req.headers.get("Authorization"), req);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const userId = auth.user.id;

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const clearAll = searchParams.get("clearAll") === "true";

    // 一键清空所有历史
    if (clearAll) {
      const result = await prisma.loginhistory.deleteMany({
        where: { userId },
      });
      return NextResponse.json({
        success: true,
        message: `已清空 ${result.count} 条登录审计历史记录`,
        deletedCount: result.count,
      });
    }

    // 删除指定单条记录
    if (id) {
      const record = await prisma.loginhistory.findUnique({
        where: { id },
      });

      if (!record || record.userId !== userId) {
        return NextResponse.json({ error: "记录不存在或无权删除" }, { status: 403 });
      }

      await prisma.loginhistory.delete({
        where: { id },
      });

      return NextResponse.json({
        success: true,
        message: "该条登录审计记录已删除",
      });
    }

    return NextResponse.json({ error: "缺少删除参数" }, { status: 400 });
  } catch (error) {
    console.error("删除登录历史错误:", error);
    return NextResponse.json(
      { error: "删除登录历史失败" },
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
