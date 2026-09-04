export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAllTokenPacks } from "@/lib/token-pack-service";
import { validateUser } from "@/lib/auth";

/**
 * GET /api/workspace/quota/token-packs
 * 获取所有在线上架的算力加油包列表 (供充值弹窗动态查询)。
 *
 * 可选登录态：若带有效登录凭证，额外返回当前会员等级信息
 * （含 tokenPackDiscount 加油包折扣），前端据此展示「会员价」。
 * 价格权威计算始终在 POST /api/workspace/quota/recharge 服务端进行。
 */
export async function GET(request: NextRequest) {
  try {
    const packs = await getAllTokenPacks(prisma, true);

    let membership: {
      id: string;
      nameZh: string;
      tokenPackDiscount: number;
    } | null = null;

    const authResult: {
      valid: boolean;
      user?: { id: string; email?: string; role?: string };
    } = await validateUser(
      request.headers.get("Authorization"),
      request
    ).catch(() => ({ valid: false }));
    if (authResult.valid && authResult.user?.id) {
      const buyer = await prisma.user.findUnique({
        where: { id: authResult.user.id },
        select: { membershipLevel: true },
      });
      const level = await prisma.membershiplevel.findUnique({
        where: { id: buyer?.membershipLevel || "FREE" },
        select: { id: true, nameZh: true, tokenPackDiscount: true },
      });
      if (level) {
        membership = {
          id: level.id,
          nameZh: level.nameZh,
          tokenPackDiscount: level.tokenPackDiscount,
        };
      }
    }

    return NextResponse.json({ packs, membership });
  } catch (error) {
    console.error("获取算力加油包列表失败:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
