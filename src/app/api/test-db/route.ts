import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
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
      return NextResponse.json({ error: "用户 test-01 未找到" });
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
