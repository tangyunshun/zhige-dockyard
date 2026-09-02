import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ name: "test-01" }, { email: "test-01" }, { phone: "18220098392" }],
      },
    });

    if (user) {
      // 为 test-01 建立标准的最新 ban_recorded 风控案由凭证
      const appealId = `ban-log-${Date.now()}`;
      await prisma.accountappeal.create({
        data: {
          id: appealId,
          userId: user.id,
          userAccount: user.name || user.email || user.id,
          userName: user.name,
          banReason: "发布违规违法内容",
          appealReason: "【依据规则: 《知阁·舟坊安全风控准则与平台合规声明》】管理员前台触发风控强制限制",
          status: "ban_recorded",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
    }

    return NextResponse.json({ success: true, message: "test-01 案由凭证已 100% 精准同步成功！" });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
