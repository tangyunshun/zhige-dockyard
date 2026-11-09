export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser, isAdminRole } from "@/lib/auth";
import {
  recycleEnterprisePool,
  ENTERPRISE_POOL_RECYCLE_DISABLED,
  ENTERPRISE_POOL_RECYCLE_MESSAGE,
} from "@/lib/credit-service";

/**
 * POST /api/admin/workspaces/recycle
 * [R0-C / 原方案 F06 止损] 企业共享池 → 个人钱包转移已暂停（含平台后台代操作）。
 * 鉴权边界（未登录 401、非平台管理员 403、空间不存在 404、非企业空间/无所有者 400）保持不变；
 * 平台管理员也收到 409 非成功暂停响应，不向 owner 或任何接收者转点，不产生成功账务/通知。
 * 服务层 recycleEnterprisePool 另有兜底，直接导入调用同样拒绝。
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const admin = await prisma.user.findUnique({ where: { id: auth.user.id } });
    if (!admin || !isAdminRole(admin.role)) {
      return NextResponse.json({ error: "权限不足" }, { status: 403 });
    }

    const body = await request.json();
    const { workspaceId, points } = body;
    const amount = Math.floor(Number(points));
    if (!workspaceId || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "参数无效：回收点数必须为大于 0 的整数" }, { status: 400 });
    }

    const ws = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, name: true, type: true, ownerId: true },
    });
    if (!ws) return NextResponse.json({ error: "空间不存在" }, { status: 404 });
    if (ws.type !== "ENTERPRISE") {
      return NextResponse.json({ error: "仅企业空间的共享池支持回收" }, { status: 400 });
    }
    if (!ws.ownerId) {
      return NextResponse.json({ error: "该空间无所有者，无法回收" }, { status: 400 });
    }

    // [R0-C] 平台管理员同样暂停：保留真实服务调用作为兜底链路，
    // 服务在事务/业务写前抛出稳定错误，不向 owner 转点、不写成功流水/账单或成功通知。
    try {
      await recycleEnterprisePool({
        workspaceId,
        userId: ws.ownerId,
        points: amount,
        operatorId: auth.user.id,
      });
    } catch (recycleError: any) {
      if (recycleError?.message === ENTERPRISE_POOL_RECYCLE_DISABLED) {
        return NextResponse.json(
          {
            success: false,
            code: ENTERPRISE_POOL_RECYCLE_DISABLED,
            error: ENTERPRISE_POOL_RECYCLE_MESSAGE,
          },
          { status: 409 },
        );
      }
      throw recycleError;
    }
    // 服务未抛出（不应发生）也绝不进入成功账务：同样按暂停诚实拒绝
    return NextResponse.json(
      {
        success: false,
        code: ENTERPRISE_POOL_RECYCLE_DISABLED,
        error: ENTERPRISE_POOL_RECYCLE_MESSAGE,
      },
      { status: 409 },
    );
  } catch (error: any) {
    // 稳定暂停错误不得被通用 catch 包装成 500
    if (error?.message === ENTERPRISE_POOL_RECYCLE_DISABLED) {
      return NextResponse.json(
        {
          success: false,
          code: ENTERPRISE_POOL_RECYCLE_DISABLED,
          error: ENTERPRISE_POOL_RECYCLE_MESSAGE,
        },
        { status: 409 },
      );
    }
    if (error?.message === "UNLIMITED") {
      return NextResponse.json({ error: "该空间为无限额度，无需回收" }, { status: 400 });
    }
    if (error?.message === "INSUFFICIENT") {
      return NextResponse.json({ error: "企业池余额不足，无法回收该数量" }, { status: 400 });
    }
    if (error?.message === "NOT_ENTERPRISE") {
      return NextResponse.json({ error: "仅企业空间的共享池支持回收" }, { status: 400 });
    }
    console.error("管理员回收算力点失败:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
