import { NextResponse } from "next/server";
import { getOAuthProviderCatalog } from "@/lib/setting-catalogs";

export const dynamic = "force-dynamic";

/**
 * 公开只读接口：第三方登录平台目录
 *
 * 与后台「系统设置 - 第三方登录」共用同一份数据库目录，
 * 保证前台登录页展示的品牌名/配色/图标与后台配置完全一致。
 * 前端在请求失败时仍保留 constants/oauth 内置兜底，登录流程不受影响。
 */
export async function GET() {
  try {
    const catalog = await getOAuthProviderCatalog();
    return NextResponse.json({ success: true, catalog });
  } catch (error) {
    console.error("读取第三方登录平台目录失败:", error);
    return NextResponse.json({ success: false, error: "读取平台目录失败" }, { status: 500 });
  }
}
