import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    // 楠岃瘉绠＄悊鍛樻潈闄?
    const authHeader = request.headers.get("authorization");
    if (
      !authHeader ||
      authHeader === "Bearer null" ||
      authHeader === "Bearer "
    ) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const userId = authHeader.replace("Bearer ", "");
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: "鏉冮檺涓嶈冻" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const targetUserId = searchParams.get("userId") || "";

    const skip = (page - 1) * limit;
    const where: any = {};

    if (targetUserId) {
      where.userId = targetUserId;
    }

    const [histories, total] = await Promise.all([
      prisma.loginHistory.findMany({
        where,
        skip,
        take: limit,
        orderBy: { loginAt: "desc" },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
              role: true,
            },
          },
        },
      }),
      prisma.loginHistory.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        histories,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get login histories error:", error);
    return NextResponse.json(
      {
        error: "鑾峰彇鐧诲綍鍘嗗彶澶辫触",
        details: error instanceof Error ? error.message : error,
      },
      { status: 500 },
    );
  }
}
