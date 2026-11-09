import { prisma } from "@/lib/prisma";
import { grantPoints } from "@/lib/credit-service";
import { isOrderExpired } from "@/lib/order-expiry";
import { isSafeAmountCents, receiptClaimId, RECEIPT_CLAIM_TYPE } from "@/lib/payment/receipt";

/**
 * 支付成功后的统一入账服务：真实回调（微信/支付宝）与模拟确认共用同一套状态机。
 *
 * 状态机（缺一不可）：
 * 1. 订单不存在 → 拒绝；
 * 2. 已 SUCCESS → 幂等返回（不重复入账）；
 * 3. 非 PENDING（EXPIRED/FAILED）→ 拒绝；
 * 4. 本地已过支付截止时间 → 落库置 EXPIRED 并拒绝（迟到回调）；
 * 5. 按订单类型入账（RECHARGE 加点 / SEAT_ADDON 加席位 / PLAN_UPGRADE 开通企业空间），
 *    全部以 order.id 作幂等键（grantPoints 去重 + idempotent 状态检查），重复通知零副作用。
 */

export interface FulfillOrderInput {
  orderNo: string;
  /** 支付方式标记（写入流水，如 WECHAT_PAY / ALIPAY） */
  paymentMethod: string;
  /** 流水备注 */
  remark: string;
  paymentMode: string;
  /** 网关侧交易号（写入 metadata 便于对账） */
  gatewayTransactionId?: string | null;
  /** 网关侧实付金额（分），用于与订单金额核对 */
  gatewayAmountCents?: number | null;
  /** 受控验签后确认的商户/应用语境（微信 mchid、支付宝 app_id），参与交易号唯一认领键 */
  merchantContext?: string | null;
}

export interface FulfillOrderResult {
  ok: boolean;
  status: "FULFILLED" | "ALREADY_PROCESSED" | "RECEIPT_PENDING_RECOVERY" | "REJECTED";
  error?: string;
  points?: number;
  seats?: number;
  workspaceId?: string | null;
}

function getBillingModel() {
  return (prisma as any).billing_record || (prisma as any).billingrecord;
}

/**
 * [R1] 收款事实核验：真实网关回调须携带受控验签后的交易号与实付金额，且金额与订单一致。
 * 缺交易号/金额或金额不符 → 拒绝；杜绝以 null 或仅验签就入账。
 * 仅用于取消/超时后收到已验收款这类「需留存待恢复事实」的分支；普通 PENDING 入账沿用原有
 * 「金额若提供必须一致」的轻量校验，避免改动已签收的 F05 幂等契约（r0b 基线不传交易号）。
 */
function receiptVerified(input: FulfillOrderInput, order: { amount?: unknown; currency?: unknown }): { ok: boolean; error?: string } {
  if (!input.gatewayTransactionId || !String(input.gatewayTransactionId).trim()) {
    return { ok: false, error: "缺少网关交易号，拒绝入账" };
  }
  // 金额按安全整数与协议精度核验：不接受小数分、NaN、Infinity、指数或超安全范围。
  if (!isSafeAmountCents(input.gatewayAmountCents) || !isSafeAmountCents(Number(order.amount))) {
    return { ok: false, error: "缺少合法的网关实付金额，拒绝入账" };
  }
  if (Number(order.amount) !== input.gatewayAmountCents) {
    return { ok: false, error: "回调金额与订单金额不一致，拒绝入账" };
  }
  if (order.currency != null && String(order.currency).toUpperCase() !== "CNY") {
    return { ok: false, error: "收款币种与订单币种不符，拒绝入账" };
  }
  return { ok: true };
}

/**
 * [U04/G4] 持久收款事实（原子）：以 (渠道, 商户语境, 交易号) 认领行保存晚到账/终态订单收款。
 * 主键唯一约束保证并发两笔到账各自独立落行、互不覆盖（不再读改写 metadata 造成丢事实）；
 * 同笔重放 P2002 → 读回按事实幂等分类。
 * 返回 replay=同一订单同一交易的重放；ownedByOrder=null 表示认领行不存在（创建成功）。
 */
async function persistTerminalReceiptFact(
  billingModel: any,
  input: FulfillOrderInput,
  order: { userId: string; workspaceId?: string | null; amount?: unknown; currency?: unknown },
  reason: string,
): Promise<{ replay: boolean; ownedByOrder: string | null }> {
  const claimId = receiptClaimId(input.paymentMethod, input.merchantContext, String(input.gatewayTransactionId));
  try {
    await billingModel.create({
      data: {
        id: claimId,
        userId: order.userId,
        workspaceId: order.workspaceId ?? null,
        type: RECEIPT_CLAIM_TYPE,
        title: "终态订单收款事实（待恢复）",
        amount: Number(order.amount),
        currency: (order.currency as string) ?? "CNY",
        status: "PENDING_RECOVERY",
        channel: input.paymentMethod,
        metadata: {
          orderNo: input.orderNo,
          gatewayTransactionId: String(input.gatewayTransactionId),
          gatewayAmountCents: input.gatewayAmountCents ?? null,
          merchantContext: input.merchantContext ?? null,
          recoverable: true,
          reason,
          recordedAt: new Date().toISOString(),
        },
      },
    });
    return { replay: false, ownedByOrder: null };
  } catch (e: any) {
    if (String(e?.code) !== "P2002") throw e;
    const owner = await billingModel.findUnique({ where: { id: claimId } });
    const ownerOrderNo = (owner?.metadata as any)?.orderNo ?? null;
    return { replay: ownerOrderNo === input.orderNo, ownedByOrder: ownerOrderNo };
  }
}

/**
 * [U04/G3] 差异事实行：同一订单收到另一笔交易——每 (订单, 渠道, 交易号) 一行原子落库，
 * 并发多笔互不覆盖、可追溯、不无限追加同一数组。返回 true 表示该差异事实已存在（重放）。
 */
async function persistReceiptDiffFact(
  billingModel: any,
  input: FulfillOrderInput,
  order: { userId: string; workspaceId?: string | null; amount?: unknown; currency?: unknown },
  reason: string,
): Promise<boolean> {
  const factId = `receipt-diff::${input.orderNo}::${input.paymentMethod}::${String(input.gatewayTransactionId)}`;
  try {
    await billingModel.create({
      data: {
        id: factId,
        userId: order.userId,
        workspaceId: order.workspaceId ?? null,
        type: RECEIPT_CLAIM_TYPE,
        title: "终态/成功订单差异收款事实",
        amount: Number(order.amount),
        currency: (order.currency as string) ?? "CNY",
        status: "DIFF_FACT",
        channel: input.paymentMethod,
        metadata: {
          orderNo: input.orderNo,
          gatewayTransactionId: String(input.gatewayTransactionId),
          gatewayAmountCents: input.gatewayAmountCents ?? null,
          merchantContext: input.merchantContext ?? null,
          reason,
          recordedAt: new Date().toISOString(),
        },
      },
    });
    return false;
  } catch (e: any) {
    if (String(e?.code) === "P2002") return true; // 同笔差异事实已存在（重放）
    throw e;
  }
}

export async function fulfillPaidOrder(input: FulfillOrderInput): Promise<FulfillOrderResult> {
  const billingModel = getBillingModel();
  if (!billingModel) return { ok: false, status: "REJECTED", error: "账单表不可用" };

  const order = await billingModel.findUnique({ where: { id: input.orderNo } });
  if (!order) return { ok: false, status: "REJECTED", error: "订单不存在" };

  const orderType = (order.type || "TOKEN_RECHARGE") as string;
  // 权益发放：RECHARGE/PLAN_UPGRADE 由本函数直接发放；SEAT_ADDON 委托专门服务，
  // 但收款唯一认领已提前覆盖所有类型（不再按类型豁免）。

  // [U04/G1] 受控验签后的收款事实才带渠道/商户语境：有交易号时严格核对订单渠道与币种，
  // 拒绝「支付宝收款兑现微信订单」这类跨渠道串单，也拒绝非本系统支持的币种。
  if (input.gatewayTransactionId) {
    if (order.channel && String(order.channel) !== input.paymentMethod) {
      return { ok: false, status: "REJECTED", error: "收款渠道与订单渠道不符，拒绝入账" };
    }
    if (order.currency != null && String(order.currency).toUpperCase() !== "CNY") {
      return { ok: false, status: "REJECTED", error: "订单币种不受支持，拒绝入账" };
    }
  }

  // [U04/G1] 底层 REAL 门禁：精确金额必须是安全整数分且与订单一致，不依赖每个路由自觉；
  // **所有订单类型（含 SEAT_ADDON）** 的 REAL 都必须有受控验签后的交易号
  // （客户端 paid/备注/截图不构成收款事实；席位不再豁免交易号唯一认领）。
  if (input.paymentMode === "REAL") {
    if (!isSafeAmountCents(input.gatewayAmountCents) || Number(order.amount) !== input.gatewayAmountCents) {
      return { ok: false, status: "REJECTED", error: "缺少合法且与订单一致的网关实付金额，拒绝入账" };
    }
  }

  // 幂等：已入账订单不得用 ALREADY_PROCESSED 掩盖金额/渠道异常，先核对本次收款事实。
  if (order.status === "SUCCESS") {
    if (input.gatewayAmountCents != null && Number(order.amount) !== Number(input.gatewayAmountCents)) {
      return { ok: false, status: "REJECTED", error: "回调金额与订单金额不一致，拒绝入账" };
    }
    // [U04/G3] SUCCESS 订单收到**另一笔交易**：这是新收款事实，不得当普通重发 ACK 后丢弃。
    // 按 (订单, 渠道, 交易号) 原子落差异事实行（并发互不覆盖、可追溯），不自动追加权益或退款；
    // 同笔重放（事实行已存在）→ 幂等 ACK。
    if (input.gatewayTransactionId) {
      const meta = (order.metadata || {}) as Record<string, unknown>;
      if (meta.gatewayTransactionId && String(meta.gatewayTransactionId) !== String(input.gatewayTransactionId)) {
        const replay = await persistReceiptDiffFact(billingModel, input, order, "SUCCESS_ORDER_SECOND_TRANSACTION");
        console.warn(`[fulfill] SUCCESS 订单 ${input.orderNo} 收到另一笔交易 ${input.gatewayTransactionId}，已${replay ? "幂等 ACK（事实已留存）" : "留存差异事实"}（未追加权益/未退款）`);
        return { ok: true, status: "ALREADY_PROCESSED", workspaceId: order.workspaceId ?? null };
      }
      // 同笔交易重放（订单 metadata 的交易号一致）→ 普通幂等
    }
    return { ok: true, status: "ALREADY_PROCESSED", workspaceId: order.workspaceId ?? null };
  }

  // [R1] 同一渠道交易号不可支撑多个独立订单：若已被其他 SUCCESS 订单占用，拒绝后续履约。
  // （业务交易唯一约束，与 order.id 幂等键的「持久化事件去重」分离；未提供交易号时跳过此检查。）
  if (input.gatewayTransactionId) {
    const dup = await billingModel.findFirst({
      where: {
        status: "SUCCESS",
        id: { not: input.orderNo },
        metadata: { path: ["gatewayTransactionId"], equals: input.gatewayTransactionId },
      },
    });
    // [U04/G3] 同字符串不同渠道是合法的不同收款：仅当历史 SUCCESS 订单的渠道与本次
    // 收款渠道一致（或历史单无渠道字段，保守按冲突处理）才判定重复，避免误冲突。
    if (dup) {
      const dupChannel = (dup as any).channel as string | null | undefined;
      const sameChannel = !dupChannel || String(dupChannel) === input.paymentMethod;
      if (sameChannel) {
        console.warn(`[fulfill] 渠道交易号 ${input.gatewayTransactionId} 已被订单 ${dup.id} 使用，拒绝重复履约`);
        return { ok: false, status: "REJECTED", error: "该渠道交易号已被其他订单使用，拒绝重复履约" };
      }
    }
  }

  // [R1] 取消/超时后确已收款：保留可信收款事实进入「待运营恢复」状态，不发放、不丢钱。
  // [U04/G4] 持久事实以 (渠道, 商户, 交易号) 认领行原子落库：并发两笔不同交易各自成行、
  // 互不覆盖；同笔重放幂等 ACK。metadata 镜像仅作展示（best-effort），不再是唯一事实。
  if (order.status === "CANCELLED" || order.status === "EXPIRED") {
    const v = receiptVerified(input, order);
    if (!v.ok) return { ok: false, status: "REJECTED", error: v.error };
    const fact = await persistTerminalReceiptFact(billingModel, input, order, `TERMINAL_${order.status}`);
    if (fact.ownedByOrder !== null && fact.ownedByOrder !== input.orderNo) {
      // 该交易已被另一订单认领：本订单侧另存差异事实行（原子、可追溯），不覆盖、不发放
      await persistReceiptDiffFact(billingModel, input, order, "DIFFERENT_TRANSACTION_CLAIMED_BY_OTHER_ORDER");
      console.warn(`[fulfill] 交易 ${input.gatewayTransactionId} 已属订单 ${fact.ownedByOrder}，订单 ${input.orderNo} 的到账已留存差异事实`);
      return { ok: true, status: "RECEIPT_PENDING_RECOVERY", workspaceId: order.workspaceId ?? null };
    }
    // metadata 镜像（best-effort，仅展示；并发覆盖不影响已持久化的事实行）
    try {
      const meta = (order.metadata || {}) as Record<string, unknown>;
      const existing = meta.pendingReceipt as { gatewayTransactionId?: string } | undefined;
      if (!existing?.gatewayTransactionId) {
        await billingModel.update({
          where: { id: input.orderNo },
          data: {
            metadata: {
              ...meta,
              pendingReceipt: {
                gatewayTransactionId: input.gatewayTransactionId,
                gatewayAmountCents: input.gatewayAmountCents,
                channel: input.paymentMethod,
                recordedAt: new Date().toISOString(),
                recoverable: true,
              },
            },
          },
        });
      } else if (existing.gatewayTransactionId !== input.gatewayTransactionId) {
        const conflicts = Array.isArray(meta.receiptConflicts) ? [...(meta.receiptConflicts as unknown[])] : [];
        if (conflicts.length < 10 && !conflicts.some((c: any) => c?.gatewayTransactionId === input.gatewayTransactionId)) {
          conflicts.push({
            gatewayTransactionId: input.gatewayTransactionId,
            gatewayAmountCents: input.gatewayAmountCents,
            channel: input.paymentMethod,
            recordedAt: new Date().toISOString(),
            reason: "DIFFERENT_TRANSACTION_FOR_TERMINAL_ORDER",
          });
          await billingModel.update({
            where: { id: input.orderNo },
            data: { metadata: { ...meta, receiptConflicts: conflicts } },
          });
        }
      }
    } catch (mirrorErr) {
      console.warn(`[fulfill] 订单 ${input.orderNo} metadata 镜像更新失败（事实行已持久）:`, (mirrorErr as Error)?.message);
    }
    if (fact.replay) {
      // 重放时重读最新状态分类：若并发路径已完成履约（SUCCESS），按已处理返回而非待恢复
      const latest = await billingModel.findUnique({ where: { id: input.orderNo } });
      if (latest?.status === "SUCCESS") {
        return { ok: true, status: "ALREADY_PROCESSED", workspaceId: order.workspaceId ?? null };
      }
      console.log(`[fulfill] 订单 ${input.orderNo} 同笔交易重放，幂等 ACK（事实行已存在）`);
    } else {
      console.warn(`[fulfill] 订单 ${input.orderNo} 已${order.status}，但收到已验收款，已留存待恢复事实（未发放）`);
    }
    return { ok: true, status: "RECEIPT_PENDING_RECOVERY", workspaceId: order.workspaceId ?? null };
  }

  if (order.status !== "PENDING") {
    return { ok: false, status: "REJECTED", error: `订单当前状态为 ${order.status}，不可入账` };
  }
  // 迟到回调：本地已过支付截止时间 → 条件关闭（仅仍为 PENDING 的记录可置 EXPIRED）并拒绝。
  // [R0-B1 F1] 禁止按旧读直接按 id 把订单改为 EXPIRED：条件更新 count=0 说明另一请求刚提交
  // SUCCESS（或状态已被其他终态处理），按最新状态分类，不覆盖已完成权益。
  // [R1] 若迟到回调确已收款（交易号+金额一致），优先留存待恢复事实而非直接拒绝丢钱。
  if (isOrderExpired(order as { status: string; expiresAt?: Date | null })) {
    const v = receiptVerified(input, order);
    if (v.ok) {
      // [U04/G4] 与终态分支同一原子事实协议：认领行持久（并发互不覆盖），metadata 仅镜像
      const fact = await persistTerminalReceiptFact(billingModel, input, order, "EXPIRED_WITH_PAID_RECEIPT");
      if (fact.ownedByOrder !== null && fact.ownedByOrder !== input.orderNo) {
        await persistReceiptDiffFact(billingModel, input, order, "DIFFERENT_TRANSACTION_CLAIMED_BY_OTHER_ORDER");
        console.warn(`[fulfill] 交易 ${input.gatewayTransactionId} 已属订单 ${fact.ownedByOrder}，超时订单 ${input.orderNo} 的到账已留存差异事实`);
        return { ok: true, status: "RECEIPT_PENDING_RECOVERY", workspaceId: order.workspaceId ?? null };
      }
      try {
        const meta = (order.metadata || {}) as Record<string, unknown>;
        const existing = meta.pendingReceipt as { gatewayTransactionId?: string } | undefined;
        if (!existing?.gatewayTransactionId) {
          await billingModel.update({
            where: { id: input.orderNo },
            data: {
              metadata: {
                ...meta,
                pendingReceipt: {
                  gatewayTransactionId: input.gatewayTransactionId,
                  gatewayAmountCents: input.gatewayAmountCents,
                  channel: input.paymentMethod,
                  recordedAt: new Date().toISOString(),
                  recoverable: true,
                },
              },
            },
          });
        } else if (existing.gatewayTransactionId !== input.gatewayTransactionId) {
          const conflicts = Array.isArray(meta.receiptConflicts) ? [...(meta.receiptConflicts as unknown[])] : [];
          if (conflicts.length < 10 && !conflicts.some((c: any) => c?.gatewayTransactionId === input.gatewayTransactionId)) {
            conflicts.push({
              gatewayTransactionId: input.gatewayTransactionId,
              gatewayAmountCents: input.gatewayAmountCents,
              channel: input.paymentMethod,
              recordedAt: new Date().toISOString(),
              reason: "DIFFERENT_TRANSACTION_FOR_EXPIRED_ORDER",
            });
            await billingModel.update({
              where: { id: input.orderNo },
              data: { metadata: { ...meta, receiptConflicts: conflicts } },
            });
          }
        }
      } catch (mirrorErr) {
        console.warn(`[fulfill] 订单 ${input.orderNo} metadata 镜像更新失败（事实行已持久）:`, (mirrorErr as Error)?.message);
      }
      // [U04] 超时订单已收到已验收款：事实已持久；同时条件关闭订单（PENDING→EXPIRED），
      // 防止后续路径再走正常履约；重放时重读最新状态分类（不掩盖并发完成的履约）。
      if (fact.replay) {
        const latest = await billingModel.findUnique({ where: { id: input.orderNo } });
        if (latest?.status === "SUCCESS") {
          return { ok: true, status: "ALREADY_PROCESSED", workspaceId: order.workspaceId ?? null };
        }
        console.log(`[fulfill] 订单 ${input.orderNo} 同笔交易重放，幂等 ACK（事实行已存在）`);
      } else {
        await billingModel.updateMany({ where: { id: input.orderNo, status: "PENDING" }, data: { status: "EXPIRED", updatedAt: new Date() } });
        console.warn(`[fulfill] 订单 ${input.orderNo} 已超时但收到已验收款，已留存待恢复事实并关单（未发放）`);
      }
      return { ok: true, status: "RECEIPT_PENDING_RECOVERY", workspaceId: order.workspaceId ?? null };
    }
    const expired = await billingModel.updateMany({
      where: { id: input.orderNo, status: "PENDING" },
      data: { status: "EXPIRED", updatedAt: new Date() },
    });
    if (expired.count === 1) {
      return { ok: false, status: "REJECTED", error: "订单已超时未支付，拒绝入账" };
    }
    const latest = await billingModel.findUnique({ where: { id: input.orderNo } });
    if (latest?.status === "SUCCESS") {
      return { ok: true, status: "ALREADY_PROCESSED", workspaceId: latest.workspaceId ?? null };
    }
    if (latest?.status === "PENDING") {
      return { ok: false, status: "REJECTED", error: "支付截止判断冲突，请稍后重试" };
    }
    return { ok: false, status: "REJECTED", error: `订单当前状态为 ${latest?.status}，不可入账` };
  }

  // 金额核对：网关侧金额必须与订单金额一致（分），不一致属于严重异常，拒绝入账并保留原状供人工排查
  if (input.gatewayAmountCents != null && Number(order.amount) !== Number(input.gatewayAmountCents)) {
    console.error(
      `[fulfill] 金额不一致！订单 ${input.orderNo} 本地=${order.amount} 网关=${input.gatewayAmountCents}，拒绝入账`,
    );
    return { ok: false, status: "REJECTED", error: "回调金额与订单金额不一致，拒绝入账" };
  }

  // [U04/G3/G1] 持久原子唯一认领：以 (渠道, 商户语境, 交易号) 为 billingrecord 主键落一条认领行。
  // 依赖数据库主键唯一约束（P2002）裁决并发，findFirst「查不到再 grant」无法防并发；
  // 认领键含渠道，同字符串不同渠道是合法的不同收款，不误冲突。
  // [U04/原5] 认领覆盖**所有订单类型（含 SEAT_ADDON）**：席位的订单 CAS 只管同一订单，
  // 不能管同交易跨订单——一笔收款最多支撑一次权益，先认领成功再委托席位履约。
  // [U04/原5] REAL 履约（含席位）必须有受控验签后的交易号——放在终态/超时留证分支之后，
  // 使「无交易号的过期/取消回调」仍可完成关单与事实留存，不被门禁误挡。
  if (input.paymentMode === "REAL" && (!input.gatewayTransactionId || !String(input.gatewayTransactionId).trim())) {
    return { ok: false, status: "REJECTED", error: "缺少网关交易号，拒绝入账" };
  }

  if (input.gatewayTransactionId) {
    const claimId = receiptClaimId(input.paymentMethod, input.merchantContext, String(input.gatewayTransactionId));
    try {
      await billingModel.create({
        data: {
          id: claimId,
          userId: order.userId,
          workspaceId: order.workspaceId ?? null,
          type: RECEIPT_CLAIM_TYPE,
          title: "网关收款唯一认领",
          amount: Number(order.amount),
          currency: (order.currency as string) ?? "CNY",
          status: "CLAIMED",
          channel: input.paymentMethod,
          metadata: {
            orderNo: input.orderNo,
            gatewayTransactionId: String(input.gatewayTransactionId),
            gatewayAmountCents: input.gatewayAmountCents ?? null,
            merchantContext: input.merchantContext ?? null,
          },
        },
      });
    } catch (e: any) {
      if (String(e?.code) !== "P2002") {
        return { ok: false, status: "REJECTED", error: "收款认领不可用，拒绝入账" };
      }
      // 主键冲突：读回认领行区分「同一订单重发/故障恢复」与「跨订单重复收款」。
      const owner = await billingModel.findUnique({ where: { id: claimId } });
      const ownerOrderNo = (owner?.metadata as any)?.orderNo;
      if (ownerOrderNo !== input.orderNo) {
        console.warn(`[fulfill] 交易号 ${input.gatewayTransactionId} 已由订单 ${ownerOrderNo} 认领，拒绝订单 ${input.orderNo} 重复履约`);
        return { ok: false, status: "REJECTED", error: "该渠道交易号已被其他订单认领，拒绝重复履约" };
      }
      // 同一订单：允许继续，权益发放由 grantPoints 的 orderNo 幂等键/席位订单 CAS 保证不重复。
    }
  }

  const meta = (order.metadata || {}) as Record<string, unknown>;
  const markSuccess = (extra: Record<string, unknown>) =>
    billingModel.update({
      where: { id: input.orderNo },
      data: {
        status: "SUCCESS",
        updatedAt: new Date(),
        metadata: { ...meta, paidAt: new Date().toISOString(), paymentMode: input.paymentMode, ...extra },
      },
    });

  // 席位增购：[R0-B] 统一走席位专用履约服务（与模拟确认同一状态机）：
  // 事务写边界条件更新裁决唯一履约权，席位增量与订单状态同事务提交/回滚；
  // REAL 必须携带受控回调验证的实付金额且与订单一致，否则拒绝入账。
  if (orderType === "SEAT_ADDON") {
    const { fulfillSeatAddonOrder } = await import("@/lib/payment/seat-addon-fulfill");
    return fulfillSeatAddonOrder({
      orderNo: input.orderNo,
      paymentMode: input.paymentMode,
      isRealPayment: true,
      gatewayTransactionId: input.gatewayTransactionId ?? null,
      gatewayAmountCents: input.gatewayAmountCents ?? null,
    });
  }

  // 企业空间开通
  if (orderType === "PLAN_UPGRADE") {
    const { fulfillEnterpriseUpgradeFromOrder } = await import("@/lib/workspace-upgrade-service");
    const fulfillment = await fulfillEnterpriseUpgradeFromOrder(input.orderNo);
    await markSuccess({ newWorkspaceId: fulfillment.newWorkspaceId, gatewayTransactionId: input.gatewayTransactionId ?? null });
    return { ok: true, status: "FULFILLED", workspaceId: fulfillment.newWorkspaceId };
  }

  // 算力点充值（默认类型）
  const points = Number(meta.points ?? 0);
  if (!Number.isFinite(points) || points <= 0) {
    return { ok: false, status: "REJECTED", error: "订单缺少有效点数" };
  }
  const workspaceId = order.workspaceId as string;
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { type: true, name: true } });
  const scope: "WALLET" | "WORKSPACE" = ws?.type === "ENTERPRISE" ? "WORKSPACE" : "WALLET";

  const grant = await grantPoints({
    scope,
    userId: order.userId,
    workspaceId,
    points,
    sourceType: "RECHARGE",
    type: "RECHARGE",
    title: order.title,
    amountCents: Number(order.amount ?? 0),
    paymentMethod: input.paymentMethod,
    orderNo: order.id,
    sourceId: order.id,
    workspaceType: ws?.type ?? null,
    workspaceName: ws?.name ?? null,
    remark: input.remark,
    // 幂等键：绑定订单号，重复通知只入账一次
    idempotencyKey: order.id,
  });

  await markSuccess({ grantLedgerId: grant.ledgerId, gatewayTransactionId: input.gatewayTransactionId ?? null });
  return { ok: true, status: "FULFILLED", points, workspaceId };
}
