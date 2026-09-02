import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import { getNextMonthResetDate } from "@/lib/quota-cycle";
import { UNLIMITED_TOKEN, isUnlimitedTokenLimit } from "@/lib/quota-token";

function safeBigInt(value: bigint | number | null | undefined, fallback = 0): bigint {
  if (value === null || value === undefined) return BigInt(fallback);
  const n = Number(value);
  return BigInt(Number.isFinite(n) ? n : fallback);
}

/**
 * POST /api/membership/upgrade
 * 在线模拟支付并立即开通目标会员等级。
 * 后续接入真实支付网关时，只需把订单/账单状态改为 PENDING，
 * 支付回调成功后调用同一套生效逻辑即可。
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: auth.error || "UNAUTHORIZED" }, { status: 401 });
    }
    const userId = auth.user.id;
    const body = await request.json().catch(() => ({}));
    const targetLevel = String(body.targetLevel || "").toUpperCase();
    const billingCycle = String(body.billingCycle || "MONTH").toUpperCase() === "YEAR" ? "YEAR" : "MONTH";
    // 支付方式由前端传入（WECHAT_PAY / ALIPAY），与空间算力点充值页保持一致；缺省默认微信支付
    const reqPaymentMethod = String(body.paymentMethod || "WECHAT_PAY").toUpperCase();
    const paymentMethod = reqPaymentMethod === "ALIPAY" ? "ALIPAY" : "WECHAT_PAY";

    if (!targetLevel) {
      return NextResponse.json({ error: "缺少目标会员等级" }, { status: 400 });
    }

    const levels = await prisma.membershiplevel.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    });
    const target = levels.find((l) => l.name === targetLevel || l.id === targetLevel);
    if (!target) {
      return NextResponse.json({ error: "目标会员等级不存在或未开放" }, { status: 404 });
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { membershipLevel: true },
    });
    const currentName = dbUser?.membershipLevel || "FREE";
    const current = levels.find((l) => l.name === currentName || l.id === currentName);

    if (current && target.sortOrder <= current.sortOrder) {
      return NextResponse.json(
        { error: `当前已是${current.nameZh}，无需重复开通` },
        { status: 400 }
      );
    }

    const amount = billingCycle === "YEAR" ? target.priceYearly : target.priceMonthly;
    const now = new Date();
    const endDate =
      billingCycle === "YEAR"
        ? new Date(now.getFullYear() + 1, now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())
        : new Date(now.getFullYear(), now.getMonth() + 1, now.getDate(), now.getHours(), now.getMinutes());

    const orderId = `mo_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    const logId = `mchg_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    const billId = `bil_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    const opId = `op_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { membershipLevel: target.name, updatedAt: new Date() },
      });

      const ownedWorkspaces = await tx.workspace.findMany({
        where: { ownerId: userId },
        select: { id: true },
      });
      const ownedWorkspaceIds = ownedWorkspaces.map((w) => w.id);
      if (ownedWorkspaceIds.length > 0) {
        const quotas = await tx.workspacequota.findMany({
          where: { workspaceId: { in: ownedWorkspaceIds } },
        });
        const nextReset = getNextMonthResetDate(now);
        const targetIsUnlimited = isUnlimitedTokenLimit(target.tokenLimit);
        const targetTokenLimit = safeBigInt(target.tokenLimit, 0);
        for (const q of quotas) {
          const currentBalance = safeBigInt(q.tokenBalance, 0);
          // 无限额度（如皇冠会员 tokenLimit = -1）：直接写入 -1，让全链路（升级/校验/展示/扣费）
          // 识别为「无限」语义，不再写死任何固定大数（原 SIMULATED_CAP = 999999999）。
          const finalBalance = targetIsUnlimited
            ? UNLIMITED_TOKEN
            : currentBalance < targetTokenLimit
              ? targetTokenLimit
              : currentBalance;
          await tx.workspacequota.update({
            where: { id: q.id },
            data: {
              membershipLevelId: target.name,
              tokenBalance: finalBalance,
              storageLimit: Number(target.maxStorage) === -1 ? BigInt(-1) : safeBigInt(target.maxStorage, 1073741824),
              apiCallsLimit: Number(target.maxApiCalls) === -1 ? BigInt(-1) : safeBigInt(target.maxApiCalls, 1000),
              resetAt: nextReset,
              updatedAt: new Date(),
            },
          });
        }
      }

      await tx.membershiporder.create({
        data: {
          id: orderId,
          userId,
          levelId: target.name,
          orderType: "UPGRADE",
          paymentMethod,
          amount,
          currency: "CNY",
          startDate: now,
          endDate,
          status: "SUCCESS",
          transactionId: crypto.randomUUID(),
          metadata: {
            fromLevel: current?.name || "FREE",
            toLevel: target.name,
            billingCycle,
            simulated: true,
          },
          updatedAt: new Date(),
        },
      });

      await tx.membershipchangelog.create({
        data: {
          id: logId,
          userId,
          levelId: target.name,
          operatorId: userId,
          changeType: "MEMBERSHIP_UPGRADE",
          oldValue: { level: current?.name || "FREE", nameZh: current?.nameZh || "免费版" },
          newValue: { level: target.name, nameZh: target.nameZh },
          reason: billingCycle === "YEAR" ? "在线支付年费开通" : "在线支付月费开通",
          createdAt: new Date(),
        },
      });

      await tx.billingrecord.create({
        data: {
          id: billId,
          userId,
          type: "MEMBERSHIP",
          title: `会员升级：${current?.nameZh || "免费版"} → ${target.nameZh}`,
          amount,
          currency: "CNY",
          status: "SUCCESS",
          channel: paymentMethod,
          referenceId: orderId,
          metadata: {
            orderId,
            levelId: target.name,
            fromLevel: current?.name || "FREE",
            toLevel: target.name,
            billingCycle,
          },
          updatedAt: new Date(),
        },
      });

      await tx.operationlog.create({
        data: {
          id: opId,
          userId,
          action: "MEMBERSHIP_UPGRADE",
          resource: "User",
          details: {
            fromLevel: current?.name || "FREE",
            toLevel: target.name,
            orderId,
            amount,
            billingCycle,
          },
          createdAt: new Date(),
        },
      });
    });

    return NextResponse.json({
      success: true,
      message: `已通过${paymentMethod === "ALIPAY" ? "支付宝" : "微信支付"}支付并开通${target.nameZh}，企业空间数量与配额已同步生效`,
      data: {
        orderId,
        membershipLevel: target.name,
        membershipLevelZh: target.nameZh,
        amount,
        billingCycle,
      },
    });
  } catch (error) {
    console.error("Membership upgrade error:", error);
    return NextResponse.json(
      { error: "会员升级失败", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}
