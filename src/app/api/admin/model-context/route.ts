import { NextRequest, NextResponse } from "next/server";
import { requirePlatformPermission } from "@/lib/security";
import { lookupModelContext } from "@/lib/model-context-catalog";

// 上下文取自公开目录，按请求实时查询（数据源结果在服务端有短时缓存）
export const dynamic = "force-dynamic";

/**
 * GET：按模型代号查询权威公开目录中的上下文窗口上限。
 * 查询参数：model（必填，平台模型代号）；upstream（可选，厂商上游模型名，优先用于匹配）。
 * 返回：{ contextLimit, outputLimit, source, matchedKey }；未命中时 contextLimit 为 null。
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requirePlatformPermission(request, "model:read", "model:manage", "system:manage");
    if (!auth.authorized) {
      return auth.errorResponse || NextResponse.json({ success: false, error: "无权限" }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);
    const model = (searchParams.get("model") || "").trim();
    const upstream = (searchParams.get("upstream") || "").trim();
    if (!model && !upstream) {
      return NextResponse.json({ success: false, error: "缺少 model 参数" }, { status: 400 });
    }
    const info = await lookupModelContext(model, upstream || undefined);
    return NextResponse.json({ success: true, data: info });
  } catch (error) {
    console.error("[model-context] 查询失败:", (error as Error)?.message);
    return NextResponse.json({ success: false, error: "查询模型上下文失败" }, { status: 500 });
  }
}
