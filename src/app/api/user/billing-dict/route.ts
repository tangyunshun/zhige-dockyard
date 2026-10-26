import { NextRequest, NextResponse } from "next/server";
import { getBillingDictFromDb } from "@/lib/billing-dict";

/**
 * GET /api/user/billing-dict
 * 返回账单 / 算力点流水显示字典（字段名 / 字段值 / 词根的中文标签），来源于数据库 system_config.billing_display_dict。
 * 仅登录用户可访问：登录态以请求头 Authorization: Bearer <token> 为准（前端 token 存于 localStorage，故服务端不读 cookie）。
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    return NextResponse.json({ success: false, error: "未登录或登录已过期" }, { status: 401 });
  }
  try {
    const dict = await getBillingDictFromDb();
    return NextResponse.json({ success: true, data: dict });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "账单字典查询失败" },
      { status: 500 },
    );
  }
}
