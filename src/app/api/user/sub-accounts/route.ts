﻿import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/auth";

/**
 * 子账号管理API
 * 用于创建、禁用、启用子账号
 */

/**
 * 获取子账号列表
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader || authHeader === "Bearer null" || authHeader === "Bearer ") {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    const userId = authHeader.replace("Bearer ", "");
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    // 查找属于该用户的子账号（通过tenantId关联）
    if (!user.tenantId) {
      return NextResponse.json({ subAccounts: [] });
    }

    const subAccounts = await prisma.user.findMany({
      where: {
        tenantId: user.tenantId,
        id: { not: userId }, // 排除主账号
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        status: true,
        role: true,
        createdAt: true,
        lastLoginAt: true,
      },
    });

    return NextResponse.json({ subAccounts });
  } catch (error) {
    console.error("获取子账号列表失败:", error);
    return NextResponse.json({ error: "获取失败" }, { status: 500 });
  }
}

/**
 * 创建子账号
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader || authHeader === "Bearer null" || authHeader === "Bearer ") {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    const adminId = authHeader.replace("Bearer ", "");
    const admin = await prisma.user.findUnique({
      where: { id: adminId },
    });

    if (!admin) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    // 检查是否是主账号
    if (!admin.tenantId) {
      return NextResponse.json({ error: "只有主账号才能创建子账号" }, { status: 403 });
    }

    const { name, email, phone, password } = await request.json();

    if (!name || !email) {
      return NextResponse.json({ error: "姓名和邮箱不能为空" }, { status: 400 });
    }

    // 检查邮箱是否已被使用
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json({ error: "邮箱已被使用" }, { status: 400 });
    }

    // 创建子账号
    const subAccount = await prisma.user.create({
      data: {
        name,
        email,
        phone: phone || null,
        password: password || "temp_password", // 应该加密处理
        role: "SUBACCOUNT",
        tenantId: admin.tenantId,
        status: "active",
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        status: true,
        role: true,
        createdAt: true,
      },
    });

    console.log(`[子账号] 主账号 ${adminId} 创建了子账号 ${subAccount.id}`);

    return NextResponse.json({
      success: true,
      subAccount,
    });
  } catch (error) {
    console.error("创建子账号失败:", error);
    return NextResponse.json({ error: "创建失败" }, { status: 500 });
  }
}

/**
 * 禁用/启用子账号
 */
export async function PUT(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader || authHeader === "Bearer null" || authHeader === "Bearer ") {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    const adminId = authHeader.replace("Bearer ", "");
    const admin = await prisma.user.findUnique({
      where: { id: adminId },
    });

    if (!admin) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    // 检查是否是主账号
    if (!admin.tenantId) {
      return NextResponse.json({ error: "只有主账号才能管理子账号" }, { status: 403 });
    }

    const { subAccountId, action } = await request.json();

    if (!subAccountId || !action) {
      return NextResponse.json({ error: "缺少必要参数" }, { status: 400 });
    }

    // 检查子账号是否属于该主账号
    const subAccount = await prisma.user.findUnique({
      where: { id: subAccountId },
    });

    if (!subAccount) {
      return NextResponse.json({ error: "子账号不存在" }, { status: 404 });
    }

    if (subAccount.tenantId !== admin.tenantId) {
      return NextResponse.json({ error: "无权操作该子账号" }, { status: 403 });
    }

    if (action === "disable") {
      // 禁用子账号
      await prisma.user.update({
        where: { id: subAccountId },
        data: {
          status: "inactive",
          sessionToken: null,
          sessionExpiresAt: null,
        },
      });
      console.log(`[子账号] 主账号 ${adminId} 禁用了子账号 ${subAccountId}`);

      return NextResponse.json({
        success: true,
        message: "子账号已禁用",
      });
    } else if (action === "enable") {
      // 启用子账号
      await prisma.user.update({
        where: { id: subAccountId },
        data: {
          status: "active",
        },
      });
      console.log(`[子账号] 主账号 ${adminId} 启用了子账号 ${subAccountId}`);

      return NextResponse.json({
        success: true,
        message: "子账号已启用",
      });
    }

    return NextResponse.json({ error: "无效的操作" }, { status: 400 });
  } catch (error) {
    console.error("管理子账号失败:", error);
    return NextResponse.json({ error: "操作失败" }, { status: 500 });
  }
}