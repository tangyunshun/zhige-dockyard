import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { getNotifications } from "@/lib/notifications-store";

export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req });
    if (!token?.id) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const userId = token.id as string;
    const list = getNotifications(userId);
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
