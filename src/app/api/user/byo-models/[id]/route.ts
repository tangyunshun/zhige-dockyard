import { NextRequest, NextResponse } from "next/server";
import { validateUser, isAdminRole } from "@/lib/auth";
import {
  listUserByoModels,
  updateUserByoModelDef,
  deleteUserByoModelDef,
  validateByoDefInput,
} from "@/lib/user-byo-model";

export const dynamic = "force-dynamic";

/** PUT：更新中央模型库定义（并重新 materialize 已绑定空间） */
export async function PUT(
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
    const parsed = validateByoDefInput(body as Partial<import("@/lib/user-byo-model").UserByoDefInput>, { requireApiKey: false });
    if (!parsed.ok) return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });

    await updateUserByoModelDef(defId, userId, isAdmin, parsed.data);
    return NextResponse.json({ success: true, data: { defs: await listUserByoModels(userId) } });
  } catch (error) {
    const e = error as { code?: string; message?: string; status?: number };
    console.error("[user/byo-models/[id]] PUT 失败:", e?.message);
    return NextResponse.json(
      { success: false, code: e?.code, error: e?.message || "更新模型库定义失败" },
      { status: (e as { status?: number })?.status || 500 },
    );
  }
}

/** DELETE：删除中央模型库定义（级联清理绑定与生效行） */
export async function DELETE(
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
    await deleteUserByoModelDef(defId, userId, isAdmin);
    return NextResponse.json({ success: true, data: { defs: await listUserByoModels(userId) } });
  } catch (error) {
    const e = error as { code?: string; message?: string; status?: number };
    console.error("[user/byo-models/[id]] DELETE 失败:", e?.message);
    return NextResponse.json(
      { success: false, code: e?.code, error: e?.message || "删除模型库定义失败" },
      { status: (e as { status?: number })?.status || 500 },
    );
  }
}
