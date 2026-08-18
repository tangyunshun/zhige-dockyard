import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { markNotificationAsRead, markAllNotificationsAsRead } from "@/lib/notifications-store";

export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req });
    if (!token?.id) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const userId = token.id as string;
    const body = await req.json().catch(() => ({}));
    const { id, all } = body;

    let updatedList;
    if (all || !id) {
      updatedList = markAllNotificationsAsRead(userId);
    } else {
      updatedList = markNotificationAsRead(userId, id);
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
