import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/auth";
import {
  DELETION_COOLDOWN_CONFIG_KEY,
  DEFAULT_DELETION_COOLDOWN_DAYS,
  getDeletionCooldownDays,
  invalidateDeletionCooldownCache,
} from "@/lib/account-deletion";

/**
 * 账号注销冷静期天数配置 API（D-02：可配置）
 * 管理员可调整「用户申请注销后进入的冷静期天数」（1~90 天，默认 7 天）。
 */

const COOLDOWN_DAYS_MIN = 1;
const COOLDOWN_DAYS_MAX = 90;

async function assertAdmin(request: NextRequest): Promise<{ ok: true; adminId: string } | { ok: false; status: number; message: string }> {
  const authHeader = request.headers.get("authorization");
  const adminId = (authHeader && authHeader.replace("Bearer ", "")) || "";
  if (!adminId) {
    return { ok: false, status: 401, message: "未授权" };
  }
  const admin = await prisma.user.findUnique({ where: { id: adminId } });
  if (!admin || !isAdminRole(admin.role)) {
    return { ok: false, status: 403, message: "需要管理员权限" };
  }
  return { ok: true, adminId };
}

/** 获取当前冷静期配置 */
export async function GET(request: NextRequest) {
  try {
    const auth = await assertAdmin(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }

    const cooldownDays = await getDeletionCooldownDays();
    const row = await prisma.systemconfig.findUnique({
      where: { key: DELETION_COOLDOWN_CONFIG_KEY },
    });
    const configuredValue = row?.value ? Number(row.value) : DEFAULT_DELETION_COOLDOWN_DAYS;

    return NextResponse.json({
      success: true,
      cooldownDays,
      configuredValue,
      range: [COOLDOWN_DAYS_MIN, COOLDOWN_DAYS_MAX],
    });
  } catch (error) {
    console.error("获取注销冷静期配置失败:", error);
    return NextResponse.json({ error: "获取配置失败" }, { status: 500 });
  }
}

/** 更新冷静期天数（仅管理员） */
export async function PUT(request: NextRequest) {
  try {
    const auth = await assertAdmin(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }

    const { cooldownDays } = await request.json();
    const days = Number(cooldownDays);
    if (!Number.isInteger(days) || days < COOLDOWN_DAYS_MIN || days > COOLDOWN_DAYS_MAX) {
      return NextResponse.json(
        { error: `冷静期天数必须是 ${COOLDOWN_DAYS_MIN}~${COOLDOWN_DAYS_MAX} 之间的整数` },
        { status: 400 },
      );
    }

    await prisma.systemconfig.upsert({
      where: { key: DELETION_COOLDOWN_CONFIG_KEY },
      create: { key: DELETION_COOLDOWN_CONFIG_KEY, value: String(days) },
      update: { value: String(days) },
    });

    // 失效内存缓存，确保立即生效
    invalidateDeletionCooldownCache();

    console.log(`[注销配置] 管理员 ${auth.adminId} 将注销冷静期调整为 ${days} 天`);

    return NextResponse.json({
      success: true,
      cooldownDays: days,
      message: `注销冷静期已更新为 ${days} 天`,
    });
  } catch (error) {
    console.error("更新注销冷静期配置失败:", error);
    return NextResponse.json({ error: "保存配置失败" }, { status: 500 });
  }
}
