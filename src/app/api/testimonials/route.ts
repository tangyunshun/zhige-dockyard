import { NextResponse } from "next/server";
import { getPublicTestimonials } from "@/lib/testimonial-service";

// 依赖数据库且含惰性轮换写操作，必须按请求实时执行
export const dynamic = "force-dynamic";

/**
 * GET /api/testimonials
 * 公开接口：返回首页当前展示组（个人 + 企业）的用户评价。
 * auto 模式下会自动执行「每周轮换一组」的惰性推进。
 */
export async function GET() {
  try {
    const payload = await getPublicTestimonials();
    return NextResponse.json({ success: true, ...payload });
  } catch (error) {
    console.error("Get public testimonials error:", error);
    return NextResponse.json({ success: false, error: "获取用户评价失败" }, { status: 500 });
  }
}
