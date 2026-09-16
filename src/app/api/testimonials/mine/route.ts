import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/testimonials/mine
 * 返回当前登录用户自己提交过的使用评价（含待审核 / 已展示 / 未通过状态与审核备注）。
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const rows = await prisma.testimonial.findMany({
      where: { submitterId: auth.user.id },
      orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        category: true,
        name: true,
        role: true,
        org: true,
        rating: true,
        content: true,
        status: true,
        reviewNote: true,
        submittedAt: true,
      },
    });

    return NextResponse.json({ success: true, testimonials: rows });
  } catch (error) {
    console.error("Get my testimonials error:", error);
    return NextResponse.json({ error: "读取我的评价失败" }, { status: 500 });
  }
}
