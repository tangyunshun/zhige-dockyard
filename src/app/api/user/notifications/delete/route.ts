import { NextRequest, NextResponse } from "next/server";
import { deleteNotification, clearReadNotifications } from "@/lib/notifications-store";
import { validateUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const auth = await validateUser(req.headers.get("Authorization"), req);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: auth.error || "UNAUTHORIZED" }, { status: 401 });
    }

    const userId = auth.user.id;
    const body = await req.json().catch(() => ({}));
    const { id, allRead } = body;

    let updatedList;
    if (allRead) {
      // 清空所有已读通知（保留未读）
      updatedList = await clearReadNotifications(userId);
    } else if (id) {
      updatedList = await deleteNotification(userId, id);
    } else {
      return NextResponse.json({ error: "缺少删除参数" }, { status: 400 });
    }

    const unreadCount = updatedList.filter(item => !item.isRead).length;

    return NextResponse.json({
      success: true,
      data: {
        list: updatedList,
        unreadCount,
      },
    });
  } catch (error) {
    console.error("Delete notification error:", error);
    return NextResponse.json({ error: "删除通知失败" }, { status: 500 });
  }
}
