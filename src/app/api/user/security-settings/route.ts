import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

// 确保用户偏好行存在（INSERT IGNORE 避免与既有唯一 userId 冲突）
async function ensurePref(userId: string) {
  await prisma.$executeRawUnsafe(
    `INSERT IGNORE INTO userpreference (id, userId, createdAt, updatedAt) VALUES (?, ?, NOW(), NOW())`,
    crypto.randomUUID(),
    userId,
  );
}

// GET - 读取当前用户的安全偏好（高危操作二次验证 / 异地登录告警）
// 注：twoFactorEnabled / loginAlertEnabled 为新增字段，使用原生 SQL 读写，
// 以免依赖重新生成 Prisma 客户端（运行期客户端引擎被占用时无法生成）。
export async function GET(request: NextRequest) {
  try {
    const auth = await validateUser(
      request.headers.get("Authorization"),
      request,
    );
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const userId = auth.user.id;

    await ensurePref(userId);
    const rows = await prisma.$queryRawUnsafe<
      { twoFactorEnabled: number; loginAlertEnabled: number }[]
    >(`SELECT twoFactorEnabled, loginAlertEnabled FROM userpreference WHERE userId = ?`, userId);
    const r = rows[0] || { twoFactorEnabled: 0, loginAlertEnabled: 1 };

    return NextResponse.json({
      success: true,
      data: {
        twoFactorEnabled: !!r.twoFactorEnabled,
        loginAlertEnabled: !!r.loginAlertEnabled,
      },
    });
  } catch (error) {
    console.error("Load security settings error:", error);
    return NextResponse.json({ error: "加载安全设置失败" }, { status: 500 });
  }
}

// PUT - 持久化安全偏好开关（替代原 localStorage 仅前端保存）
export async function PUT(request: NextRequest) {
  try {
    const auth = await validateUser(
      request.headers.get("Authorization"),
      request,
    );
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const userId = auth.user.id;

    const body = await request.json().catch(() => ({}));
    const twoFactorEnabled =
      typeof body.twoFactorEnabled === "boolean"
        ? body.twoFactorEnabled
        : undefined;
    const loginAlertEnabled =
      typeof body.loginAlertEnabled === "boolean"
        ? body.loginAlertEnabled
        : undefined;

    if (twoFactorEnabled === undefined && loginAlertEnabled === undefined) {
      return NextResponse.json({ error: "无可更新的字段" }, { status: 400 });
    }

    await ensurePref(userId);
    const sets: string[] = [];
    const params: unknown[] = [];
    if (twoFactorEnabled !== undefined) {
      sets.push("twoFactorEnabled = ?");
      params.push(twoFactorEnabled ? 1 : 0);
    }
    if (loginAlertEnabled !== undefined) {
      sets.push("loginAlertEnabled = ?");
      params.push(loginAlertEnabled ? 1 : 0);
    }
    await prisma.$executeRawUnsafe(
      `UPDATE userpreference SET ${sets.join(", ")}, updatedAt = NOW() WHERE userId = ?`,
      ...params,
      userId,
    );

    const rows = await prisma.$queryRawUnsafe<
      { twoFactorEnabled: number; loginAlertEnabled: number }[]
    >(`SELECT twoFactorEnabled, loginAlertEnabled FROM userpreference WHERE userId = ?`, userId);
    const r = rows[0] || { twoFactorEnabled: 0, loginAlertEnabled: 1 };

    return NextResponse.json({
      success: true,
      data: {
        twoFactorEnabled: !!r.twoFactorEnabled,
        loginAlertEnabled: !!r.loginAlertEnabled,
      },
    });
  } catch (error) {
    console.error("Save security settings error:", error);
    return NextResponse.json({ error: "保存安全设置失败" }, { status: 500 });
  }
}
