import { NextRequest, NextResponse } from "next/server";
import { markNotificationAsRead, markAllNotificationsAsRead } from "@/lib/notifications-store";
import { validateUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const auth = await validateUser(req.headers.get("Authorization"), req);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: auth.error || "UNAUTHORIZED" }, { status: 401 });
    }

    const userId = auth.user.id;
    const body = await req.json().catch(() => ({}));
    const { id, all } = body;

    let updatedList;
    if (all || !id) {
      updatedList = await markAllNotificationsAsRead(userId);
    } else {
      updatedList = await markNotificationAsRead(userId, id);
    }

    const unreadCount = updatedList.filter(item => !item.isRead).length;

    return NextResponse.json({
      success: true,
      data: {
        list: updatedList,
        unreadCount
      }
    });
  } catch (error) {
    console.error("Mark notification as read error:", error);
    return NextResponse.json({ error: "标记已读失败" }, { status: 500 });
  }
}
