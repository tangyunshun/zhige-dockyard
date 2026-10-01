import { NextRequest, NextResponse } from "next/server";
import { validateUser } from "@/lib/auth";
import { getAdminPermissions } from "@/lib/security";

export const dynamic = "force-dynamic";

const SUPER_ROLES = ["SUPER_ADMIN", "SUPERADMIN", "super_admin", "superadmin"];

/**
 * GET /api/system/permission-context
 * 返回「调用者自己」的角色与权限包，供统一拦截层（middleware）使用。
 *
 * 安全说明：只回传**调用者本人**的信息（与 /api/auth/me 同级别信息），
 * 无法用于查询他人权限，因此不存在越权读取风险。
 */
export async function GET(request: NextRequest) {
  let auth;
  try {
    auth = await validateUser(request.headers.get("Authorization"), request);
  } catch (error) {
    console.error("[permission-context] 身份校验异常:", error);
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  if (!auth.valid || !auth.user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const role = String(auth.user.role || "").trim();
  const isSuperAdmin = SUPER_ROLES.includes(role);

  // 超级管理员不需要读取权限包（本身无条件放行），因此不会因权限服务异常被牵连
  let permissions: string[] = [];
  if (!isSuperAdmin) {
    try {
      permissions = await getAdminPermissions(auth.user.id);
    } catch (error) {
      // 故障安全：权限包读取失败必须显式报错，**不得降级为"空权限包"**（否则中间件会误判为无权限者而 403，或 fail-open 放行）
      console.error("[permission-context] 读取权限包失败，返回 503（PERMISSION_CONTEXT_UNAVAILABLE）:", error);
      return NextResponse.json(
        { success: false, error: "PERMISSION_CONTEXT_UNAVAILABLE" },
        { status: 503, headers: { "Cache-Control": "no-store" } }
      );
    }
  }

  return NextResponse.json(
    { success: true, role, isSuperAdmin, permissions },
    { headers: { "Cache-Control": "no-store" } }
  );
}
