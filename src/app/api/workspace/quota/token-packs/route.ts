export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAllTokenPacks } from "@/lib/token-pack-service";

/**
 * GET /api/workspace/quota/token-packs
 * 获取所有在线上架的算力加油包列表 (供充值弹窗动态查询)
 */
export async function GET(request: NextRequest) {
  try {
    const packs = await getAllTokenPacks(prisma, true);
    return NextResponse.json({ packs });
  } catch (error) {
    console.error("获取算力加油包列表失败:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
