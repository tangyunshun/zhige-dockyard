export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { assertWorkspaceWritable } from "@/lib/workspace-readonly-guard";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import { requireWorkspaceMembership } from "@/lib/security";
import {
  recycleEnterprisePool,
  ENTERPRISE_POOL_RECYCLE_DISABLED,
  ENTERPRISE_POOL_RECYCLE_MESSAGE,
} from "@/lib/credit-service";

/**
 * POST /api/workspace/quota/recycle
 * [R0-C / 原方案 F06 止损] 企业共享池 → 个人钱包转移已暂停。
 * 身份边界（未登录 401、非成员/普通成员 403、非企业空间 400）保持不变；
 * 原本有资格的 OWNER / 空间 ADMIN 也收到 409 非成功暂停响应，不产生任何账务写或成功通知。
 * 服务层 recycleEnterprisePool 另有兜底，直接导入调用同样拒绝。
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const body = await request.json();
    const { workspaceId, points } = body;

    const amount = Math.floor(Number(points));
    if (!workspaceId || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "参数无效：回收点数必须为大于 0 的整数" }, { status: 400 });
    }

    // 归档 / 停用空间禁止写入（硬只读）
    await assertWorkspaceWritable(workspaceId);

    const isMember = await requireWorkspaceMembership(auth.user.id, workspaceId);
    if (!isMember) {
      return NextResponse.json({ error: "越权警告：您非该工作空间成员" }, { status: 403 });
    }

    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    const member = await prisma.workspacemember.findUnique({
      where: { userId_workspaceId: { userId: auth.user.id, workspaceId } },
    });
    const isOwner = ws?.ownerId === auth.user.id || member?.role === "OWNER";
    const isAdmin = member?.role === "ADMIN";
    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: "越权警告：仅空间所有者或管理员可回收算力点" }, { status: 403 });
    }
    if (ws?.type !== "ENTERPRISE") {
      return NextResponse.json({ error: "仅企业空间的共享池支持回收至个人钱包" }, { status: 400 });
    }

    // [R0-C] 身份门禁通过后仍统一暂停：保留真实服务调用作为兜底链路，
    // recycleEnterprisePool 在事务/业务写前抛出稳定错误，绝不产生扣池、加钱包、
    // 分桶、流水、成功账单或"回收成功"通知。
    try {
      await recycleEnterprisePool({
        workspaceId,
        userId: auth.user.id,
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
    console.error("回收算力点失败:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
