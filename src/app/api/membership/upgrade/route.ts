import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import { getNextMonthResetDate } from "@/lib/quota-cycle";
import { UNLIMITED_TOKEN, isUnlimitedTokenLimit } from "@/lib/quota-token";
import { mergeLimits } from "@/lib/limit-utils";
import { grantPoints } from "@/lib/credit-service";

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

    // 会员额度补齐的「点数增量」必须落算力点流水与分桶，禁止直改余额不留痕。
    // 声明在事务外：事务提交后统一调用 credit-service 入账（自身管理事务，不可嵌套）。
    const membershipGrants: Array<{ workspaceId: string; delta: number }> = [];

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
          // 无限额度（会员 tokenLimit = -1）：直接写入 -1，让全链路（升级/校验/展示/扣费）
          // 识别为「无限」语义，不再写死任何固定大数（原 SIMULATED_CAP = 999999999）。
          const finalBalance = targetIsUnlimited
            ? UNLIMITED_TOKEN
            : currentBalance < targetTokenLimit
              ? targetTokenLimit
              : currentBalance;
          // 存储/调用限额：会员等级提供「基础保底」，空间级扩容包提供「空间扩容」，
          // 生效值取两者与既有值中的最大值（无限制 -1 优先），保证会员升级绝不缩水已购扩容包。
          const finalStorage = mergeLimits(q.storageLimit, target.maxStorage);
          const finalApiCalls = mergeLimits(q.apiCallsLimit, target.maxApiCalls);
          // 记录本次实际补入的点数增量（无限额度语义无增量），稍后统一落流水与分桶
          const grantDelta = targetIsUnlimited ? 0 : Number(finalBalance - currentBalance);
          if (grantDelta > 0) {
            membershipGrants.push({ workspaceId: q.workspaceId, delta: grantDelta });
          }
          await tx.workspacequota.update({
            where: { id: q.id },
            data: {
              membershipLevelId: target.name,
              tokenBalance: finalBalance,
              storageLimit: BigInt(finalStorage),
              apiCallsLimit: BigInt(finalApiCalls),
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
          reason: `在线支付${billingCycle === "YEAR" ? "年付" : "月付"}开通会员（${current?.nameZh || "免费版"} → ${target.nameZh}）`,
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

    // 会员额度入账：逐空间写算力点流水 + 赠送/会员分桶（幂等键保证重复回调不重复入账）
    // 注意：余额已在上方事务内变更，而 credit-service 自管事务无法嵌套，故入账在事务外执行。
    // 一旦入账失败即构成「余额已改、无流水」的账务不一致，必须落结构化对账凭据，
    // 绝不只 console.error 后视为成功（总纲 2.2/4.2）。
    const grantFailures: Array<{ workspaceId: string; points: number; error: string }> = [];
    for (const g of membershipGrants) {
      try {
        await grantPoints({
          scope: "WORKSPACE",
          userId,
          workspaceId: g.workspaceId,
          points: g.delta,
          sourceType: "MEMBERSHIP",
          type: "MEMBERSHIP_GRANT",
          title: `会员升级额度：${target.nameZh}`,
          sourceId: orderId,
          paymentMethod,
          idempotencyKey: `MEMBERSHIP_GRANT:${orderId}:${g.workspaceId}`,
          remark: `会员 ${current?.nameZh || "免费版"} → ${target.nameZh} 额度补齐`,
        });
      } catch (grantErr) {
        const errMsg = (grantErr as Error)?.message || "未知错误";
        console.error(
          `[会员升级] 算力点流水写入失败（空间 ${g.workspaceId}，点数 ${g.delta}，订单 ${orderId}）：`,
          errMsg,
        );
        grantFailures.push({ workspaceId: g.workspaceId, points: g.delta, error: errMsg });

        // 结构化对账凭据：后台可按 action=BILLING_RECONCILE_REQUIRED 检索人工待办
        try {
          await prisma.operationlog.create({
            data: {
              id: crypto.randomUUID(),
              userId,
              action: "BILLING_RECONCILE_REQUIRED",
              resource: "Workspace",
              details: {
                reason: "MEMBERSHIP_GRANT_LEDGER_FAILED",
                orderId,
                workspaceId: g.workspaceId,
                points: g.delta,
                level: target.name,
                error: errMsg,
              },
              createdAt: new Date(),
            },
          });
        } catch (logErr) {
          // 连对账凭据都写不进去，属最高级别告警
          console.error(
            "[会员升级] 对账凭据写入失败（必须立即人工介入）:",
            (logErr as Error)?.message,
          );
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `已通过${paymentMethod === "ALIPAY" ? "支付宝" : "微信支付"}支付并开通${target.nameZh}，企业空间数量与配额已同步生效`,
      data: {
        orderId,
        // 存在入账失败时如实暴露：绝不把「余额已改但无流水」报成完全成功
        reconcileRequired: grantFailures.length > 0,
        grantFailures,
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
