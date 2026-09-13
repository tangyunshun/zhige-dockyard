﻿import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, validatePasswordStrength, validateUser } from "@/lib/auth";

/**
 * 子账号管理 API
 *
 * 业务逻辑修复说明：
 *  1. 此前「子账号」依赖 user.tenantId，但全站没有任何流程会写入该字段，
 *     导致接口恒返回「只有主账号才能创建子账号」，功能实际不可用。
 *     现改为：企业空间的所有者 = 主账号，首次创建子账号时自动开通所属租户(tenant)。
 *  2. 此前子账号密码以明文写入（password || "temp_password"），存在严重安全隐患，
 *     现统一使用 bcrypt 哈希存储，并校验密码强度与邮箱格式。
 *  3. 子账号可正常登录（与普通账号一致），停用后将立即失效其全部会话。
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 读取已存在的租户 ID（不产生副作用，用于查询） */
async function getTenantId(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { tenantId: true },
  });
  return user?.tenantId || null;
}

/** 判断用户是否为「子账号主账号」（企业空间所有者） */
async function isSubAccountOwner(userId: string): Promise<boolean> {
  const enterprise = await prisma.workspace.findFirst({
    where: { ownerId: userId, type: "ENTERPRISE" },
    select: { id: true },
  });
  return !!enterprise;
}

/**
 * 确保用户拥有租户：企业空间所有者首次使用时自动开通
 * @returns 租户 ID；若用户不具备资格则返回 null
 */
async function ensureTenantId(userId: string): Promise<string | null> {
  const existing = await getTenantId(userId);
  if (existing) return existing;

  if (!(await isSubAccountOwner(userId))) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true },
  });
  if (!user) return null;

  const tenantId = `tenant_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await prisma.tenant.create({
    data: {
      id: tenantId,
      name: `${user.name || user.email || "企业"} 的组织`,
      description: "由企业空间所有者自动开通的子账号主账号租户",
      status: "active",
      updatedAt: new Date(),
    },
  });
  await prisma.user.update({
    where: { id: userId },
    data: { tenantId },
  });
  return tenantId;
}

/** 获取子账号列表 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await validateUser(request.headers.get("Authorization"), request);
    if (!authResult.valid || !authResult.user) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }
    const userId = authResult.user.id;
    const tenantId = await getTenantId(userId);
    const canManage = !!tenantId || (await isSubAccountOwner(userId));

    if (!tenantId) {
      return NextResponse.json({ subAccounts: [], canManage });
    }

    const subAccounts = await prisma.user.findMany({
      where: { tenantId, id: { not: userId } },
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
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ subAccounts, canManage });
  } catch (error) {
    console.error("获取子账号列表失败:", error);
    return NextResponse.json({ error: "获取失败" }, { status: 500 });
  }
}

/** 创建子账号 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await validateUser(request.headers.get("Authorization"), request);
    if (!authResult.valid || !authResult.user) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }
    const adminId = authResult.user.id;

    const tenantId = await ensureTenantId(adminId);
    if (!tenantId) {
      return NextResponse.json(
        { error: "仅企业空间所有者可创建子账号，请先创建/成为企业空间所有者" },
        { status: 403 },
      );
    }

    const { name, email, phone, password } = await request.json();

    const trimmedName = (name || "").trim();
    const trimmedEmail = (email || "").trim().toLowerCase();
    const trimmedPhone = (phone || "").trim();

    if (!trimmedName) {
      return NextResponse.json({ error: "姓名不能为空" }, { status: 400 });
    }
    if (!trimmedEmail || !EMAIL_RE.test(trimmedEmail)) {
      return NextResponse.json({ error: "请输入有效的邮箱地址" }, { status: 400 });
    }
    if (trimmedPhone && !/^1[3-9]\d{9}$/.test(trimmedPhone)) {
      return NextResponse.json({ error: "请输入正确的 11 位手机号码" }, { status: 400 });
    }
    if (!password) {
      return NextResponse.json({ error: "初始密码不能为空" }, { status: 400 });
    }
    const strength = validatePasswordStrength(String(password));
    if (!strength.valid) {
      return NextResponse.json({ error: strength.error || "密码强度不足" }, { status: 400 });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: trimmedEmail },
    });
    if (existingUser) {
      return NextResponse.json({ error: "该邮箱已被使用" }, { status: 400 });
    }

    const hashed = await hashPassword(String(password));

    const subAccount = await prisma.user.create({
      data: {
        name: trimmedName,
        email: trimmedEmail,
        phone: trimmedPhone || null,
        password: hashed,
        passwordChangedAt: new Date(),
        role: "SUBACCOUNT",
        tenantId,
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
        lastLoginAt: true,
      },
    });

    await prisma.operationlog
      .create({
        data: {
          id: `op_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          userId: adminId,
          action: "SUBACCOUNT_CREATE",
          resource: "user/sub-account",
          details: { subAccountId: subAccount.id, email: subAccount.email },
          createdAt: new Date(),
        },
      })
      .catch(() => {});

    return NextResponse.json({ success: true, subAccount });
  } catch (error) {
    console.error("创建子账号失败:", error);
    return NextResponse.json({ error: "创建失败" }, { status: 500 });
  }
}

/** 禁用/启用子账号 */
export async function PUT(request: NextRequest) {
  try {
    const authResult = await validateUser(request.headers.get("Authorization"), request);
    if (!authResult.valid || !authResult.user) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }
    const adminId = authResult.user.id;

    const tenantId = await getTenantId(adminId);
    if (!tenantId) {
      return NextResponse.json({ error: "只有主账号才能管理子账号" }, { status: 403 });
    }

    const { subAccountId, action, newPassword } = await request.json();
    if (!subAccountId || !action) {
      return NextResponse.json({ error: "缺少必要参数" }, { status: 400 });
    }

    const subAccount = await prisma.user.findUnique({ where: { id: subAccountId } });
    if (!subAccount) {
      return NextResponse.json({ error: "子账号不存在" }, { status: 404 });
    }
    if (subAccount.tenantId !== tenantId) {
      return NextResponse.json({ error: "无权操作该子账号" }, { status: 403 });
    }

    if (action === "disable") {
      await prisma.user.update({
        where: { id: subAccountId },
        data: {
          status: "inactive",
          sessionToken: null,
          sessionExpiresAt: null,
          lastForcedLogoutAt: new Date(),
        },
      });
      return NextResponse.json({ success: true, message: "子账号已禁用" });
    }

    if (action === "enable") {
      await prisma.user.update({
        where: { id: subAccountId },
        data: { status: "active" },
      });
      return NextResponse.json({ success: true, message: "子账号已启用" });
    }

    if (action === "reset_password") {
      if (!newPassword) {
        return NextResponse.json({ error: "请输入新密码" }, { status: 400 });
      }
      const strength = validatePasswordStrength(String(newPassword));
      if (!strength.valid) {
        return NextResponse.json({ error: strength.error || "密码强度不足" }, { status: 400 });
      }
      const hashed = await hashPassword(String(newPassword));
      await prisma.user.update({
        where: { id: subAccountId },
        data: {
          password: hashed,
          passwordChangedAt: new Date(),
          // 重置密码后强制踢下线，需使用新密码重新登录
          sessionToken: null,
          sessionExpiresAt: null,
          refreshToken: null,
          refreshTokenExpiresAt: null,
        },
      });
      await prisma.operationlog
        .create({
          data: {
            id: `op_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            userId: adminId,
            action: "SUBACCOUNT_RESET_PASSWORD",
            resource: "user/sub-account",
            details: { subAccountId },
            createdAt: new Date(),
          },
        })
        .catch(() => {});
      return NextResponse.json({ success: true, message: "子账号密码已重置" });
    }

    return NextResponse.json({ error: "无效的操作" }, { status: 400 });
  } catch (error) {
    console.error("管理子账号失败:", error);
    return NextResponse.json({ error: "操作失败" }, { status: 500 });
  }
}
