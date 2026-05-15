import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const status = searchParams.get("status");

    const skip = (page - 1) * limit;

    // 鏋勫缓鏌ヨ鏉′欢
    const where: any = {};
    if (status) {
      where.status = status;
    }

    // 鏌ヨ鐢宠瘔鍒楄〃
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
            },
          },
        },
      }),
      prisma.accountappeal.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        appeals,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error("Get appeals error:", error);
    return NextResponse.json(
      { message: "服务器错误" },
      { status: 500 },
    );
  }
}
