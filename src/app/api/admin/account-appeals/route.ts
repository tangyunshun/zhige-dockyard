import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const status = searchParams.get("status");
    const userStatus = searchParams.get("userStatus");
    const dateRange = searchParams.get("dateRange");
    const businessType = searchParams.get("businessType");
    const search = searchParams.get("search");

    const skip = (page - 1) * limit;

    // 构建查询条件
    const where: any = {};
    if (status && status !== "all") {
      where.status = status;
    }
    if (userStatus && userStatus !== "all") {
      where.user = { status: userStatus };
    }
    if (dateRange && dateRange !== "all") {
      const now = new Date();
      if (dateRange === "today") {
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        where.createdAt = { gte: todayStart };
      } else if (dateRange === "7days") {
        const pass7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        where.createdAt = { gte: pass7 };
      } else if (dateRange === "30days") {
        const pass30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        where.createdAt = { gte: pass30 };
      }
    }
    if (businessType && businessType !== "all") {
      where.businessType = businessType;
    }
    if (search && search.trim()) {
      const kw = search.trim();
      where.OR = [
        { userAccount: { contains: kw } },
        { userName: { contains: kw } },
        { contactInfo: { contains: kw } },
        { userEmail: { contains: kw } },
        { userPhone: { contains: kw } },
        { banReason: { contains: kw } },
        { appealReason: { contains: kw } },
        { businessType: { contains: kw } },
      ];
    }

    // 自动清理：申诉记录严格遵循 3 年合规生命周期留存，超过 3 年的历史申诉记录自动物理清除
    try {
      const threeYearsAgo = new Date();
      threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
      await prisma.accountappeal.deleteMany({
        where: {
          createdAt: { lt: threeYearsAgo },
        },
      });
    } catch (e) {
      console.warn("自动清理超过3年的历史申诉记录失败:", e);
    }

    // 查询申诉列表
    const [appeals, total] = await Promise.all([
      prisma.accountappeal.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              phone: true,
              email: true,
              status: true,
              banReason: true,
              avatar: true,
            },
          },
        },
      }),
      prisma.accountappeal.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      appeals: appeals.map((a: any) => ({
        ...a,
        userName: a.userName || a.user?.name || (a.userAccount && !a.userAccount.includes("@") ? a.userAccount : null) || a.userAccount,
        userPhone: a.userPhone || a.user?.phone || null,
        userEmail: a.userEmail || a.user?.email || (a.userAccount && a.userAccount.includes("@") ? a.userAccount : null),
        userAvatar: a.user?.avatar || null,
        businessType: a.businessType || "账号解封申诉",
      })),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error("Get admin account appeals list error:", error);
    return NextResponse.json(
      { error: "获取申诉列表失败", message: error?.message || "服务器错误" },
      { status: 500 }
    );
  }
}
