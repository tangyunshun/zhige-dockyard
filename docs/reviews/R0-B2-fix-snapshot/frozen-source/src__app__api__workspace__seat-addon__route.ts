import { NextRequest, NextResponse } from "next/server";
import { assertWorkspaceWritable } from "@/lib/workspace-readonly-guard";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import { createCharge, resolvePaymentMode } from "@/lib/payment-gateway";
import { newOrderExpiry } from "@/lib/order-expiry";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * POST /api/workspace/seat-addon
 *
 * 席位增购（按剩余计费时长折算价格）：
 *   增购金额 = 增购席位数 × 单席位月单价 × (剩余天数 / 计费周期天数)
 * 单席位月单价 = 套餐月付价 ÷ 套餐自带席位数。
 * 新席位有效期至当前套餐到期日（随套餐一并清零）。
 *
 * 安全与支付：仅空间所有者（OWNER）可发起；企业/团队空间且套餐已订阅（非免费版）方可增购。
 * 本接口**只创建 PENDING 订单并返回收银台地址**，绝不立即加席位——
 * 席位增加发生在支付确认（PAYMENT_MODE=mock 走 /api/payments/mock/confirm，
 * 真实网关模式走网关回调）之后，杜绝“选完支付方式就生效”的模拟支付。
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.user) return NextResponse.json({ error: "未登录" }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as {
      workspaceId?: string;
      seats?: number;
      paymentMethod?: string;
    };
    const workspaceId = body.workspaceId;
    // 归档 / 停用空间禁止写入（硬只读）
    await assertWorkspaceWritable(workspaceId);
    // [R0-B] 席位数必须是正安全整数：不接受小数/NaN/负数/溢出，不用 Math.floor 把损坏输入猜成有效
    const seats = Number(body.seats);
    const channel = body.paymentMethod === "ALIPAY" ? "ALIPAY" : "WECHAT_PAY";
    if (!workspaceId) return NextResponse.json({ error: "缺少工作空间 ID" }, { status: 400 });
    if (!Number.isSafeInteger(seats) || seats <= 0 || seats > 2147483647) {
      return NextResponse.json({ error: "增购席位数必须为正整数" }, { status: 400 });
    }

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        id: true,
        ownerId: true,
        name: true,
        type: true,
        plan: true,
        planBillingCycle: true,
        planExpiresAt: true,
      },
    });
    if (!workspace) return NextResponse.json({ error: "工作空间不存在" }, { status: 404 });
    if (workspace.ownerId !== auth.user.id) {
      return NextResponse.json({ error: "仅空间所有者可增购席位" }, { status: 403 });
    }
    if (workspace.type !== "ENTERPRISE") {
      return NextResponse.json({ error: "席位增购仅面向企业 / 团队空间" }, { status: 400 });
    }
    if (!workspace.plan || workspace.plan === "STANDARD") {
      return NextResponse.json({ error: "免费版不支持席位增购，请先升级套餐" }, { status: 400 });
    }
    if (!workspace.planExpiresAt) {
      return NextResponse.json({ error: "当前套餐未设置到期时间，无法折算增购价格" }, { status: 400 });
    }
    // [R0-B2-2] 下单与收费入口使用同一合法周期规则：空间真实 planBillingCycle 必须是 MONTH 或 YEAR；
    // 缺失/空值/其它字符串（含历史损坏的 WEEK）一律在创建订单与调用 createCharge 之前阻断，
    // 零新订单、零网关调用、零席位变化。不默认 MONTH、不清洗历史库、不改价格公式。
    const billingCycle = workspace.planBillingCycle;
    if (billingCycle !== "MONTH" && billingCycle !== "YEAR") {
      return NextResponse.json(
        { error: "当前空间的计费周期不合规（仅支持月付/年付），无法创建增购订单，请人工核查" },
        { status: 400 },
      );
    }

    const planRow = await prisma.workspaceplan.findUnique({ where: { key: workspace.plan } });
    if (!planRow) return NextResponse.json({ error: "套餐配置不存在" }, { status: 404 });

    const planMaxMembers = Number(planRow.maxMembers || 0);
    const seatUnitMonthly = planMaxMembers > 0 ? Number(planRow.priceMonthly) / planMaxMembers : 0;
    if (seatUnitMonthly <= 0) {
      return NextResponse.json({ error: "当前套餐不支持席位增购" }, { status: 400 });
    }

    const now = Date.now();
    const remainingMs = workspace.planExpiresAt.getTime() - now;
    if (remainingMs <= 0) {
      return NextResponse.json({ error: "套餐已到期，请先续费后再增购席位" }, { status: 400 });
    }
    const remainingDays = Math.max(1, Math.ceil(remainingMs / DAY_MS));
    const daysInCycle = billingCycle === "YEAR" ? 365 : 30;
    const proratedPerSeat = (seatUnitMonthly * remainingDays) / daysInCycle;
    const amountCents = Math.round(seats * proratedPerSeat); // 单位：分

    const orderNo = `SA_${Date.now()}_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
    const expiresAtIso = workspace.planExpiresAt.toISOString();
    const mode = resolvePaymentMode();
    const orderMeta = {
      seats,
      billingCycle,
      remainingDays,
      seatUnitMonthly,
      planKey: workspace.plan,
      expiresAt: expiresAtIso,
      workspaceName: workspace.name,
      createdVia: "seat-addon",
    };

    // 仅创建 PENDING 订单，绝不立即加席位；席位增加发生在支付确认之后
    await prisma.billingrecord.create({
      data: {
        id: orderNo,
        userId: auth.user.id,
        workspaceId,
        type: "SEAT_ADDON",
        title: `空间「${workspace.name}」增购 ${seats} 个席位（至 ${expiresAtIso.slice(0, 10)}）`,
        amount: amountCents,
        currency: "CNY",
        status: "PENDING",
        expiresAt: newOrderExpiry(),
        channel,
        referenceId: workspaceId,
        metadata: orderMeta,
        updatedAt: new Date(),
      },
    });

    // 产出收银台地址（mock 模式为本地模拟页；real 模式为网关支付链接，由回调入账）
    const charge = await createCharge({
      expiresAt: newOrderExpiry(),
      orderNo,
      amountCents,
      subject: "知阁·舟坊 - 席位增购",
      channel,
    });

    // [R0-B1 F3] 真实微信 Native 下单的二维码载体（codeUrl）由服务端保存到订单 metadata，
    // 本人订单查询（/api/payments/order）读取后由扫码收银台渲染二维码：
    //  - 只保存必要的展示载体，不保存整个敏感网关 payload，也不接受浏览器自传支付地址；
    //  - 条件更新（仅 PENDING）确保载体保存不覆盖并发完成的履约记录或订单状态。
    let codeUrl: string | null = null;
    if (
      charge.gatewayPayload &&
      typeof charge.gatewayPayload === "object" &&
      typeof (charge.gatewayPayload as Record<string, unknown>).codeUrl === "string"
    ) {
      codeUrl = (charge.gatewayPayload as Record<string, unknown>).codeUrl as string;
    }
    if (charge.mode === "REAL" && channel === "WECHAT_PAY") {
      if (!codeUrl) {
        // 网关未返回二维码载体：诚实告知无法收银，订单保留原状供重试/人工核查，不伪装可付款
        return NextResponse.json(
          {
            success: false,
            orderNo,
            error: "未能准备收银台：支付渠道未返回二维码载体，订单已保留（未扣款），请稍后重试或联系客服",
          },
          { status: 502 },
        );
      }
      const saved = await prisma.billingrecord.updateMany({
        where: { id: orderNo, status: "PENDING" },
        data: { metadata: { ...orderMeta, codeUrl }, updatedAt: new Date() },
      });
      if (saved.count !== 1) {
        // 载体保存竞争失败：按最新事实处理（极小概率下履约已在并发中完成），不覆盖履约记录
        const latest = await prisma.billingrecord.findUnique({ where: { id: orderNo } });
        if (latest?.status === "SUCCESS") {
          return NextResponse.json({
            success: true,
            orderNo,
            amountCents,
            seats,
            paymentMode: charge.mode,
            payUrl: charge.payUrl,
            notice: "该订单已完成入账，无需再支付。",
          });
        }
        return NextResponse.json(
          {
            success: false,
            orderNo,
            error: "未能准备收银台：支付载体保存失败，订单已保留（未扣款），请稍后重试或联系客服",
          },
          { status: 502 },
        );
      }
    }

    return NextResponse.json({
      success: true,
      orderNo,
      amountCents,
      seats,
      paymentMode: charge.mode,
      payUrl: charge.payUrl,
      notice:
        charge.mode === "MOCK"
          ? "当前为【模拟支付】，不会产生真实扣款；支付确认后席位才会生效。"
          : "已使用真实支付渠道下单，请完成支付。",
    });
  } catch (error) {
    console.error("[seat-addon] 创建订单失败:", (error as Error)?.message);
    return NextResponse.json({ success: false, error: "席位增购下单失败" }, { status: 500 });
  }
}
