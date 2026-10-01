import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminRole, validateUser } from "@/lib/auth";
import { requirePlatformPermission } from "@/lib/security";

export async function GET(request: NextRequest) {
  try {
    // 验证管理员权限
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const userId = auth.user.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: "权限不足" }, { status: 403 });
    }

    // 细粒度权限：API 密钥属敏感凭证（task 建议 system:manage；同时保留 apikey:* 以兼容存量授予）
    const permCheck = await requirePlatformPermission(request, "system:manage", "apikey:read", "apikey:manage");
    if (!permCheck.authorized) {
      return permCheck.errorResponse || NextResponse.json({ error: "无权限操作 API 密钥" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const targetUserId = searchParams.get("userId") || "";

    const skip = (page - 1) * limit;
    const where: any = {};

    if (targetUserId) {
      where.userId = targetUserId;
    }

    const [records, total] = await Promise.all([
      prisma.apikey.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        // 只 SELECT 白名单字段，绝不查询/返回 keyHash
        select: {
          id: true,
          name: true,
          description: true,
          keyPrefix: true,
          lastUsedAt: true,
          createdAt: true,
          updatedAt: true,
          user: {
            select: { id: true, name: true, email: true, avatar: true, role: true },
          },
        },
      }),
      prisma.apikey.count({ where }),
    ]);

    // 明确 DTO 白名单：禁止 keyHash / 原始 Key / 内部密码字段
    const apiKeys = records.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description ?? null,
      keyPrefix: r.keyPrefix,
      configured: true,
      user: r.user
        ? {
            id: r.user.id,
            name: r.user.name,
            email: r.user.email,
            avatar: r.user.avatar,
            role: r.user.role,
          }
        : null,
      lastUsedAt: r.lastUsedAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));

    return NextResponse.json({
      success: true,
      data: {
        apiKeys,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    // 错误响应不得返回数据库错误详情
    console.error("Get API keys error:", error);
    return NextResponse.json({ error: "获取 API 密钥失败" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // 验证管理员权限
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const userId = auth.user.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: "权限不足" }, { status: 403 });
    }

    // 细粒度权限：API 密钥属敏感凭证（task 建议 system:manage；同时保留 apikey:* 以兼容存量授予）
    const permCheck = await requirePlatformPermission(request, "system:manage", "apikey:read", "apikey:manage");
    if (!permCheck.authorized) {
      return permCheck.errorResponse || NextResponse.json({ error: "无权限操作 API 密钥" }, { status: 403 });
    }

    const { id } = await request.json();

    if (!id) {
      return NextResponse.json({ error: "缺少 API Key ID" }, { status: 400 });
    }

    await prisma.apikey.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: "API Key 已删除",
    });
  } catch (error) {
    console.error("Delete API key error:", error);
    return NextResponse.json({ error: "删除 API 密钥失败" }, { status: 500 });
  }
}
