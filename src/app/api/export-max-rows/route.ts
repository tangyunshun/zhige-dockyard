import { NextRequest, NextResponse } from "next/server";
import { validateUser } from "@/lib/auth";
import { getExportMaxRows } from "@/lib/export-config";

export const dynamic = "force-dynamic";

/**
 * 读取导出条数上限（systemconfig.export.maxRows）的实时值。
 * 供导出页挂载时拉取，使后台「系统设置」里修改的上限立即生效。
 * 任意登录态（管理员 / 用户）可读；该值仅用于导出条数封顶，无敏感信息。
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const { valid } = await validateUser(authHeader, request);
    if (!valid) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    const maxRows = await getExportMaxRows();
    return NextResponse.json({ maxRows });
  } catch {
    return NextResponse.json({ maxRows: 5000 });
  }
}
