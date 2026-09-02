export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import { getAllTokenPacks, updateTokenPackMemoryCache } from "@/lib/token-pack-service";

/**
 * GET /api/admin/token-packs
 * 后台获取所有算力加油包列表 (包含下架项目)
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const roleUpper = (auth.user.role || "").toUpperCase();
    const isAdminUser = roleUpper === "ADMIN" || roleUpper === "SUPER_ADMIN" || roleUpper === "PLATFORM_ADMIN";
    if (!isAdminUser) {
      return NextResponse.json({ error: "越权警告：仅系统管理员可管理算力加油包" }, { status: 403 });
    }

    const packs = await getAllTokenPacks(prisma, false);
    return NextResponse.json(
      { packs },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      }
    );
  } catch (error) {
    console.error("后台获取算力包失败:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}

/**
 * POST /api/admin/token-packs
 * 后台新建算力加油包
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "未授权，请重新登录" }, { status: 401 });
    }

    const roleUpper = (auth.user.role || "").toUpperCase();
    const isAdminUser = roleUpper === "ADMIN" || roleUpper === "SUPER_ADMIN" || roleUpper === "PLATFORM_ADMIN";
    if (!isAdminUser) {
      return NextResponse.json({ error: "越权警告：仅系统超级管理员可创建算力加油包" }, { status: 403 });
    }

    const body = await request.json();
    const { name, points, price, icon, color, description, isPopular, isActive, sortOrder } = body;

    if (!name || typeof points !== "number" || points <= 0 || typeof price !== "number" || price < 0) {
      return NextResponse.json({ error: "参数无效：必须填入加油包名称、正数算力点数与有效价格" }, { status: 400 });
    }

    const packId = `pack_${Date.now()}`;
    
    updateTokenPackMemoryCache(packId, {
      id: packId,
      name,
      points: Number(points),
      price: Number(price),
      icon: icon || "⚡",
      color: color || "#3182ce",
      description: description || "",
      isPopular: isPopular === true,
      isActive: isActive !== false,
      sortOrder: Number(sortOrder || 0),
    });
    
    // 物理写入 MySQL 数据库
    const newPack = await (prisma as any).tokenpack.create({
      data: {
        id: packId,
        name,
        points: BigInt(Math.round(points)),
        price: Number(price),
        icon: icon || "⚡",
        color: color || "#3182ce",
        description: description || null,
        isPopular: isPopular === true,
        isActive: isActive !== false,
        sortOrder: Number(sortOrder || 0),
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      message: `恭喜！成功创建算力加油包 [${name}]`,
      pack: {
        id: newPack.id,
        name: newPack.name,
        points: Number(newPack.points),
        price: Number(newPack.price),
        icon: newPack.icon,
        color: newPack.color,
        description: newPack.description,
        isPopular: newPack.isPopular,
        isActive: newPack.isActive,
        sortOrder: Number(newPack.sortOrder),
      },
    });
  } catch (error: any) {
    console.error("创建算力加油包失败:", error);
    return NextResponse.json({ error: error?.message || "服务器内部错误，请稍后重试" }, { status: 500 });
  }
}
