/**
 * 组件进度只读审计接口（管理员）
 *
 * 安全约束：
 *  - 权限：requirePlatformPermission(request, "component:stats_audit", "component:read")；
 *  - **仅 GET**：不接受任何组件状态写入，不存在 publish/activate/delete 路径；
 *  - 只读数据库；不返回密钥值（不读 apiKeyEnv 值）、不返回 baseUrl；
 *  - 错误返回明确 code/message。
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePlatformPermission } from "@/lib/security";
import { buildComponentProgressAudit } from "@/lib/component-progress-audit";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const authCheck = await requirePlatformPermission(request, "component:stats_audit", "component:read");
    if (!authCheck.authorized) {
      return (
        authCheck.errorResponse ||
        NextResponse.json({ success: false, code: "FORBIDDEN", message: "无权限查看组件进度审计" }, { status: 403 })
      );
    }

    // 仅接受只读筛选参数；任何非预期的状态变更参数一律忽略（本接口不存在写路径）
    const rawWindow = request.nextUrl.searchParams.get("windowDays");
    let windowDays = 7;
    if (rawWindow !== null) {
      const parsed = Number(rawWindow);
      if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 365) {
        return NextResponse.json(
          { success: false, code: "INVALID_WINDOW_DAYS", message: "windowDays 必须为 1~365 的整数" },
          { status: 400 },
        );
      }
      windowDays = parsed;
    }

    const data = await buildComponentProgressAudit({ windowDays });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("组件进度只读审计失败:", (error as Error)?.message);
    return NextResponse.json(
      { success: false, code: "PROGRESS_AUDIT_FAILED", message: "组件进度审计读取失败，请稍后重试" },
      { status: 500 },
    );
  }
}
