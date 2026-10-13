import { NextRequest, NextResponse } from "next/server";
import { validateUser, isAdminRole } from "@/lib/auth";
import {
  listUserByoModels,
  listOwnedWorkspacesForBinding,
  createUserByoModelDef,
  validateByoDefInput,
} from "@/lib/user-byo-model";

export const dynamic = "force-dynamic";

/** GET：当前用户的中央模型库定义列表 + 可绑定的本人空间列表 */
export async function GET(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ success: false, error: "未授权" }, { status: 401 });
    }
    const userId = auth.user.id;
    const [defs, workspaces] = await Promise.all([
      listUserByoModels(userId),
      listOwnedWorkspacesForBinding(userId),
    ]);
    return NextResponse.json({ success: true, data: { defs, workspaces } });
  } catch (error) {
    console.error("[user/byo-models] GET 失败:", (error as Error)?.message);
    return NextResponse.json({ success: false, error: "查询模型库失败" }, { status: 500 });
  }
}

/** POST：创建中央模型库定义（尚未绑定空间） */
export async function POST(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ success: false, error: "未授权" }, { status: 401 });
    }
    const userId = auth.user.id;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const parsed = validateByoDefInput(body as Partial<import("@/lib/user-byo-model").UserByoDefInput>, { requireApiKey: true });
    if (!parsed.ok) return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });

    await createUserByoModelDef(userId, parsed.data);
    const defs = await listUserByoModels(userId);
    return NextResponse.json({ success: true, data: { defs } });
  } catch (error) {
    const e = error as { code?: string; message?: string; status?: number };
    console.error("[user/byo-models] POST 失败:", e?.message);
    return NextResponse.json(
      { success: false, code: e?.code, error: e?.message || "创建模型库定义失败" },
      { status: (e as { status?: number })?.status || 500 },
    );
  }
}
