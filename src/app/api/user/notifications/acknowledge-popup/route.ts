import { NextRequest, NextResponse } from "next/server";
import { acknowledgeLoginPopup } from "@/lib/notifications-store";
import { validateUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const auth = await validateUser(req.headers.get("Authorization"), req);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: auth.error || "UNAUTHORIZED" }, { status: 401 });
    }

    const userId = auth.user.id;
    const body = await req.json().catch(() => ({}));
    const { id } = body;
    if (!id) {
      return NextResponse.json({ error: "缺少通知 ID" }, { status: 400 });
    }

    const updatedList = await acknowledgeLoginPopup(userId, id);
    const unreadCount = updatedList.filter((item) => !item.isRead).length;

    return NextResponse.json({
      success: true,
      data: {
        list: updatedList,
        unreadCount,
      },
    });
  } catch (error) {
    console.error("Acknowledge login popup error:", error);
    return NextResponse.json({ error: "确认登录弹窗失败" }, { status: 500 });
  }
}
