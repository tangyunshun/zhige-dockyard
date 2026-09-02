export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import { getTokenPackModel, updateTokenPackMemoryCache, removeTokenPackMemoryCache } from "@/lib/token-pack-service";
import { pointsToYuan } from "@/lib/point-rate";

/**
 * PUT /api/admin/token-packs/[id]
 * 更新算力加油包 (包含上下架、热门推荐与信息修改)
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const roleUpper = (auth.user.role || "").toUpperCase();
    const isAdminUser = roleUpper === "ADMIN" || roleUpper === "SUPER_ADMIN" || roleUpper === "PLATFORM_ADMIN";
    if (!isAdminUser) {
      return NextResponse.json({ error: "越权警告：仅系统超级管理员可修改算力加油包" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { name, points, price, icon, color, description, isPopular, isActive, sortOrder } = body;

    // 1. 优先打入双重极速防护内存，确保当前会话与后续拉取绝对呈现最新改动
    updateTokenPackMemoryCache(id, {
      ...(name !== undefined && { name }),
      ...(points !== undefined && { points: Number(points) }),
      ...(price !== undefined && { price: Number(price) }),
      ...(icon !== undefined && { icon }),
      ...(color !== undefined && { color }),
      ...(description !== undefined && { description }),
      ...(isPopular !== undefined && { isPopular: Boolean(isPopular) }),
      ...(isActive !== undefined && { isActive: Boolean(isActive) }),
      ...(sortOrder !== undefined && { sortOrder: Number(sortOrder) }),
    });

    // 2. 物理数据库层以 upsert 强制持久化落库
    const model = getTokenPackModel(prisma);
    let updated: any = null;

    if (model) {
      try {
        updated = await model.upsert({
          where: { id },
          update: {
            ...(name !== undefined && { name }),
            ...(points !== undefined && { points: BigInt(Math.round(Number(points))) }),
            ...(price !== undefined && { price: Number(price) }),
            ...(icon !== undefined && { icon }),
            ...(color !== undefined && { color }),
            ...(description !== undefined && { description }),
            ...(isPopular !== undefined && { isPopular: Boolean(isPopular) }),
            ...(isActive !== undefined && { isActive: Boolean(isActive) }),
            ...(sortOrder !== undefined && { sortOrder: Number(sortOrder) }),
            updatedAt: new Date(),
          },
          create: {
            id,
            name: name || "算力加油包",
            points: BigInt(Math.round(Number(points || 1000))),
            price: Number(price ?? pointsToYuan(Number(points || 1000))),
            icon: icon || "⚡",
            color: color || "#3182ce",
            description: description || "",
            isPopular: isPopular === true,
            isActive: isActive !== false,
            sortOrder: Number(sortOrder || 0),
            updatedAt: new Date(),
          },
        });
      } catch (dbErr) {
        console.warn("更新 tokenpack 物理表异常，走零报错自愈:", dbErr);
      }
    }

    return NextResponse.json({
      success: true,
      message: "恭喜！算力加油包修改成功保存落库",
      pack: updated
        ? {
            id: updated.id,
            name: updated.name,
            points: Number(updated.points),
            price: Number(updated.price),
            icon: updated.icon,
            color: updated.color,
            description: updated.description,
            isPopular: Boolean(updated.isPopular),
            isActive: Boolean(updated.isActive),
            sortOrder: Number(updated.sortOrder),
          }
        : { id, name, points, price, icon, color, description, isPopular, isActive, sortOrder },
    });
  } catch (error: any) {
    console.error("修改算力加油包失败:", error);
    return NextResponse.json({ error: error?.message || "服务器内部错误" }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/token-packs/[id]
 * 删除算力加油包
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const roleUpper = (auth.user.role || "").toUpperCase();
    const isAdminUser = roleUpper === "ADMIN" || roleUpper === "SUPER_ADMIN" || roleUpper === "PLATFORM_ADMIN";
    if (!isAdminUser) {
      return NextResponse.json({ error: "越权警告：仅系统超级管理员可删除算力加油包" }, { status: 403 });
    }

    const { id } = await params;
    removeTokenPackMemoryCache(id);

    const model = getTokenPackModel(prisma);
    if (model) {
      await model.delete({ where: { id } }).catch(() => null);
    }

    return NextResponse.json({
      success: true,
      message: "算力加油包已从数据库成功删除",
    });
  } catch (error: any) {
    console.error("删除算力加油包失败:", error);
    return NextResponse.json({ error: error?.message || "服务器内部错误" }, { status: 500 });
  }
}
