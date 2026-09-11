import { NextRequest, NextResponse } from "next/server";
import { getNotifications } from "@/lib/notifications-store";
import { validateUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const auth = await validateUser(req.headers.get("Authorization"), req);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: auth.error || "UNAUTHORIZED" }, { status: 401 });
    }

    const userId = auth.user.id;

    const { searchParams } = new URL(req.url);
    const popup = searchParams.get("popup") === "true";
    const unread = searchParams.get("unread") === "true";
    // includePending=true 用于管理/调试场景，强制返回未确认的弹窗；默认排除
    const includePending = searchParams.get("includePending") === "true";

    const list = await getNotifications(userId, {
      popup,
      unread,
      excludePendingPopups: !includePending,
    });
    const unreadCount = list.filter(item => !item.isRead).length;

    return NextResponse.json({
      success: true,
      data: {
        list,
        unreadCount
      }
    });
  } catch (error) {
    console.error("Get user notifications list error:", error);
    return NextResponse.json({ error: "获取通知列表失败" }, { status: 500 });
  }
}
