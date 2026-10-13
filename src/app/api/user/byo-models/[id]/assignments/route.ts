import { NextRequest, NextResponse } from "next/server";
import { validateUser, isAdminRole } from "@/lib/auth";
import { setDefAssignments } from "@/lib/user-byo-model";

export const dynamic = "force-dynamic";

/**
 * POST /api/user/byo-models/[id]/assignments
 * 全量设置某模型库定义的空间绑定（body.assignments: { workspaceId, enabled?, shareWithMembers? }[]）。
 * 服务端保证单空间单绑定，并 materialize 到各空间的 workspace_byo_model 生效行。
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: defId } = await params;
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ success: false, error: "未授权" }, { status: 401 });
    }
    const userId = auth.user.id;
    const isAdmin = isAdminRole(auth.user.role);

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const raw = Array.isArray(body.assignments) ? (body.assignments as unknown[]) : [];
    const assignments = raw
      .map((r): { workspaceId: string; enabled?: boolean; shareWithMembers?: boolean } | null => {
        if (!r || typeof r !== "object") return null;
        const o = r as Record<string, unknown>;
        const wsId = typeof o.workspaceId === "string" ? o.workspaceId : "";
        if (!wsId) return null;
        return {
          workspaceId: wsId,
          enabled: o.enabled !== false,
          shareWithMembers: o.shareWithMembers !== false,
        };
      })
      .filter((x): x is { workspaceId: string; enabled?: boolean; shareWithMembers?: boolean } => x !== null);

    const defs = await setDefAssignments(defId, userId, isAdmin, assignments);
    return NextResponse.json({ success: true, data: { defs } });
  } catch (error) {
    const e = error as { code?: string; message?: string; status?: number };
    console.error("[user/byo-models/[id]/assignments] POST 失败:", e?.message);
    return NextResponse.json(
      { success: false, code: e?.code, error: e?.message || "设置空间绑定失败" },
      { status: (e as { status?: number })?.status || 500 },
    );
  }
}
