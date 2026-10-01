import { NextRequest, NextResponse } from "next/server";
import { validateUser, isAdminRole } from "@/lib/auth";
import { requireWorkspaceMembership, getLogicalWorkspaceRole } from "@/lib/security";

/**
 * BYO 配置权限：平台管理员（isAdminRole）可代管任意空间；
 * 否则必须是该空间成员，且写操作需 OWNER/ADMIN 角色。
 * 返回非 null 表示已直接响应（拒绝）。
 */
async function assertByoAccess(
  user: { id: string; role?: string | null },
  workspaceId: string,
  requireWrite: boolean,
): Promise<NextResponse | null> {
  if (isAdminRole(user.role)) return null;
  const isMember = await requireWorkspaceMembership(user.id, workspaceId);
  if (!isMember) return NextResponse.json({ error: "无权访问该工作空间" }, { status: 403 });
  if (requireWrite) {
    const role = await getLogicalWorkspaceRole(user.id, workspaceId);
    if (role !== "OWNER" && role !== "ADMIN") {
      return NextResponse.json({ error: "仅空间所有者或管理员可配置自带模型" }, { status: 403 });
    }
  }
  return null;
}
import {
  validateByoInput,
  upsertWorkspaceByoModel,
  deleteWorkspaceByoModel,
  getWorkspaceByoModelView,
} from "@/lib/workspace-byo-model";

/**
 * 空间自带模型（BYO）配置接口
 *  - GET  ?workspaceId=xxx            任意成员可查看配置状态（不含密钥）
 *  - PUT  ?workspaceId=xxx  + body    仅空间 OWNER/ADMIN 可配置
 *  - DELETE ?workspaceId=xxx          仅空间 OWNER/ADMIN 可清除
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.user) return NextResponse.json({ error: "未登录" }, { status: 401 });
    const workspaceId = new URL(request.url).searchParams.get("workspaceId") || "";
    if (!workspaceId) return NextResponse.json({ error: "缺少 workspaceId" }, { status: 400 });

    const denied = await assertByoAccess(auth.user, workspaceId, false);
    if (denied) return denied;

    const view = await getWorkspaceByoModelView(workspaceId);
    return NextResponse.json({ success: true, data: view });
  } catch (error) {
    console.error("[byo-model] GET 失败:", (error as Error)?.message);
    return NextResponse.json({ success: false, error: "查询 BYO 模型失败" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.user) return NextResponse.json({ error: "未登录" }, { status: 401 });
    const workspaceId = new URL(request.url).searchParams.get("workspaceId") || "";
    if (!workspaceId) return NextResponse.json({ error: "缺少 workspaceId" }, { status: 400 });

    const denied = await assertByoAccess(auth.user, workspaceId, true);
    if (denied) return denied;

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const parsed = validateByoInput(body as Partial<import("@/lib/workspace-byo-model").WorkspaceByoInput>, { requireApiKey: false });
    if (!parsed.ok) return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });

    await upsertWorkspaceByoModel(workspaceId, parsed.data);
    return NextResponse.json({ success: true, data: await getWorkspaceByoModelView(workspaceId) });
  } catch (error) {
    const e = error as { code?: string; message?: string; status?: number };
    console.error("[byo-model] PUT 失败:", e?.message);
    return NextResponse.json(
      { success: false, code: e?.code, error: e?.message || "保存 BYO 模型失败" },
      { status: (e as { status?: number })?.status || 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.user) return NextResponse.json({ error: "未登录" }, { status: 401 });
    const workspaceId = new URL(request.url).searchParams.get("workspaceId") || "";
    if (!workspaceId) return NextResponse.json({ error: "缺少 workspaceId" }, { status: 400 });

    const denied = await assertByoAccess(auth.user, workspaceId, true);
    if (denied) return denied;

    await deleteWorkspaceByoModel(workspaceId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[byo-model] DELETE 失败:", (error as Error)?.message);
    return NextResponse.json({ success: false, error: "清除 BYO 模型失败" }, { status: 500 });
  }
}
