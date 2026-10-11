import { NextRequest, NextResponse } from "next/server";
import { requirePermissionGrantAuthority, writeAuditLog } from "@/lib/security";
import { runPermissionKeySync } from "../../../../../../scripts/sync-permission-keys";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/permissions/sync
 *
 * 后台「同步代码权限点」按钮入口：复用 scripts/sync-permission-keys.ts 的
 * runPermissionKeySync（代码扫描 → 目录补录，只增不删），返回新增权限点清单。
 * 鉴权与既有 /api/admin/permissions 的写入动作保持一致（仅超管可授予/回收权限）。
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requirePermissionGrantAuthority(
      request,
      "permission:manage",
      "admin:permission_grant",
      "admin:create",
      "admin:update",
      "admin:revoke"
    );
    if (!authResult.authorized) {
      return authResult.errorResponse!;
    }
    const operatorId = authResult.user!.id;

    const result = await runPermissionKeySync();

    await writeAuditLog(
      operatorId,
      "system:settings",
      {
        action: "SYNC_CODE_PERMISSION_KEYS",
        added: result.added,
        keys: result.keys,
        message: "权限点自动发现同步（代码扫描 → 目录补录，只增不删）",
      },
      null,
      null,
      request
    ).catch(() => {});

    const message =
      result.added > 0 ? `发现并补录 ${result.added} 个新权限点` : "目录已齐全";

    return NextResponse.json({
      success: true,
      added: result.added,
      keys: result.keys,
      message,
    });
  } catch (error) {
    console.error("Sync code permission keys error:", error);
    return NextResponse.json(
      { error: "同步代码权限点失败", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}
