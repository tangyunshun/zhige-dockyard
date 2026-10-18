import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformPermission } from "@/lib/security";

const ALLOWED_STATUS = ["pending", "contacted", "closed"] as const;

/**
 * PATCH /api/admin/demo-requests/[id]
 * 更新演示申请的处理状态（pending 待处理 / contacted 已联系 / closed 已关闭）
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requirePlatformPermission(
      request,
      "user:update",
      "appeal:read",
      "appeal:manage",
      "demo:read",
      "demo:manage"
    );
    if (!authResult.authorized) {
      return authResult.errorResponse!;
    }

    const { id } = await params;
    const exists = await prisma.demorequest.findUnique({ where: { id } });
    if (!exists) {
      return NextResponse.json({ success: false, error: "演示申请记录不存在" }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as { status?: string };
    const status = body.status;
    if (!status || !(ALLOWED_STATUS as readonly string[]).includes(status)) {
      return NextResponse.json(
        { success: false, error: "非法的处理状态，仅允许 pending / contacted / closed" },
        { status: 400 }
      );
    }

    const updated = await prisma.demorequest.update({
      where: { id },
      data: { status },
    });

    return NextResponse.json({ success: true, request: updated });
  } catch (error: any) {
    console.error("Update demo-request status error:", error);
    return NextResponse.json(
      { error: "更新演示申请状态失败", message: error?.message || "服务器错误" },
      { status: 500 }
    );
  }
}
