import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformPermission } from "@/lib/security";

/**
 * 诊断入口：仅平台授权可访问，绝不向匿名/普通用户暴露用户资料与申诉记录。
 */
export async function GET(request: Request) {
  const auth = await requirePlatformPermission(request as any, "system:manage", "debug:read");
  if (!auth.authorized) {
    return auth.errorResponse || NextResponse.json({ success: false, error: "无权限" }, { status: 403 });
  }
  try {
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { name: "test-01" },
          { email: "test-01" },
          { phone: "18220098392" },
        ],
      },
    });

    if (!user) {
      return NextResponse.json({ error: "用户 test-01 未找到" }, { status: 404 });
    }

    const appeals = await prisma.accountappeal.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        status: user.status,
        banReason: user.banReason,
        updatedAt: user.updatedAt,
      },
      appealCount: appeals.length,
      appeals,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
