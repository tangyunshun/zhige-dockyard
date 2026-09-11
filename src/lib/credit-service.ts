import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

/**
 * 算力点统一账务服务（全系统唯一入口）
 *
 * 账户模型（三级归属，均通过 pointgrant 分桶承载）：
 *   - WALLET        用户钱包：用户在线充值/退款所得，跨空间通用（个人空间、企业空间均可消费）
 *   - PERSONAL_GIFT 个人空间专属：新用户注册福利（注册当月起连续 3 个自然月，每月 100 点，
 *                    当月有效、月底清零），仅可在该用户的个人空间消费
 *   - WORKSPACE     空间共享池：线下充值/人工入账所得（购买所得），仅空间成员可消费
 *
 * 消耗规则（分桶 FIFO）：按「到期时间最早优先，无到期日的最后」逐桶扣减，
 * 保证用户快过期的赠送点优先被消耗，避免过期清零造成浪费。
 *
 * 一致性：pointgrant.remaining 为真源，userwallet.balance / workspacequota.tokenBalance
 * 为其账户级汇总快照；所有变动在同一事务内完成，并写入 pointledger 流水（含余额快照）。
 */

/** 新用户注册福利：每月赠送算力点数 */
export const NEW_USER_GIFT_POINTS = 100;
/** 注册福利发放月数：注册当月起连续 3 个自然月（第 4 个月起永久停发，用完自费充值） */
export const REGISTER_GIFT_MONTHS = 3;
/** 到期提醒提前天数 */
export const EXPIRE_REMIND_DAYS = 7;
/** 无限额度标记值 */
export const UNLIMITED_BALANCE = -1;

export type PointScope = "WALLET" | "PERSONAL_GIFT" | "PERSONAL_DEDUCTION" | "WORKSPACE";

export type LedgerType =
  | "GIFT_REGISTER"
  | "GIFT_EXPIRE"
  | "RECHARGE"
  | "OFFLINE_RECHARGE"
  | "MEMBERSHIP_GRANT"
  | "CONSUME"
  | "REFUND"
  | "MANUAL_ADJUST";

export class InsufficientPointsError extends Error {
  available: number;
  required: number;
  constructor(available: number, required: number) {
    super(`算力点余额不足：当前可用 ${available} 点，本次需要 ${required} 点`);
    this.name = "InsufficientPointsError";
    this.available = available;
    this.required = required;
  }
}

export interface GrantParams {
  scope: PointScope;
  userId?: string | null;
  workspaceId?: string | null;
  points: number;
  sourceType: string;
  type: LedgerType;
  title: string;
  sourceId?: string | null;
  expiresAt?: Date | null;
  operatorId?: string | null;
  amountCents?: number;
  paymentMethod?: string | null;
  orderNo?: string | null;
  workspaceType?: string | null;
  workspaceName?: string | null;
  userEmail?: string | null;
  componentId?: string | null;
  componentName?: string | null;
  taskId?: string | null;
  remark?: string | null;
  idempotencyKey?: string | null;
}

export interface GrantResult {
  skipped: boolean;
  ledgerId: string;
  grantId: string;
  balanceAfter: number;
}

export interface ConsumeParams {
  workspaceId: string;
  userId: string;
  points: number;
  componentId?: string | null;
  componentName?: string | null;
  taskId?: string | null;
  workspaceType?: string | null;
  workspaceName?: string | null;
  userEmail?: string | null;
  remark?: string | null;
  idempotencyKey?: string | null;
}

export interface ConsumeResult {
  skipped: boolean;
  unlimited: boolean;
  consumed: number;
  ledgerIds: string[];
  /** 各分桶扣减明细（用于区分赠送点消耗与充值点消耗） */
  details: Array<{ grantId: string; scope: string; sourceType: string; points: number }>;
  /** 扣减后账户可用余额（钱包 + 空间池） */
  balanceAfter: number;
}

/** 空间配额不存在时兜底创建（需要 membershipLevelId） */
async function ensureWorkspaceQuota(
  tx: Prisma.TransactionClient,
  workspaceId: string,
): Promise<void> {
  const existing = await tx.workspacequota.findUnique({ where: { workspaceId } });
  if (existing) return;

  const ws = await tx.workspace.findUnique({
    where: { id: workspaceId },
    select: { ownerId: true, type: true },
  });

  let levelId = "FREE";
  if (ws?.ownerId) {
    const owner = await tx.user.findUnique({
      where: { id: ws.ownerId },
      select: { membershipLevel: true },
    });
    levelId = owner?.membershipLevel || "FREE";
  }
  const ml =
    (await tx.membershiplevel.findUnique({ where: { id: levelId } })) ||
    (await tx.membershiplevel.findFirst());

  await tx.workspacequota.create({
    data: {
      id: crypto.randomUUID(),
      workspaceId,
      membershipLevelId: ml?.id || "FREE",
      updatedAt: new Date(),
    },
  });
}

/** 账户余额汇总（钱包 / 空间池各自快照） */
async function readBalances(
  tx: Prisma.TransactionClient,
  userId?: string | null,
  workspaceId?: string | null,
) {
  let wallet = 0;
  let workspace = 0;
  if (userId) {
    const w = await tx.userwallet.findUnique({ where: { userId } });
    wallet = w ? Number(w.balance) : 0;
  }
  if (workspaceId) {
    const q = await tx.workspacequota.findUnique({ where: { workspaceId } });
    workspace = q ? Number(q.tokenBalance) : 0;
  }
  return { wallet, workspace };
}

/**
 * 发放算力点：建桶 + 增加账户余额 + 写入账流水（幂等）
 */
export async function grantPoints(params: GrantParams): Promise<GrantResult> {
  const points = Math.floor(Number(params.points) || 0);
  if (points <= 0) throw new Error("发放的算力点必须大于 0");
  if (params.scope === "WALLET" && !params.userId) throw new Error("钱包发放必须指定 userId");
  if (params.scope !== "WALLET" && !params.workspaceId) {
    throw new Error("空间发放必须指定 workspaceId");
  }

  // 幂等：同一 key 只发放一次
  if (params.idempotencyKey) {
    const exist = await prisma.pointledger.findFirst({
      where: { idempotencyKey: { startsWith: `${params.idempotencyKey}#` } },
      orderBy: { createdAt: "asc" },
    });
    if (exist) {
      return {
        skipped: true,
        ledgerId: exist.id,
        grantId: exist.grantId || "",
        balanceAfter: Number(exist.balanceAfter),
      };
    }
  }

  return prisma.$transaction(async (tx) => {
    const now = new Date();

    if (params.scope !== "WALLET") {
      await ensureWorkspaceQuota(tx, params.workspaceId as string);
    }

    const grant = await tx.pointgrant.create({
      data: {
        id: crypto.randomUUID(),
        scope: params.scope,
        userId: params.userId ?? null,
        workspaceId: params.scope === "WALLET" ? null : params.workspaceId ?? null,
        points: BigInt(points),
        remaining: BigInt(points),
        sourceType: params.sourceType,
        sourceId: params.sourceId ?? null,
        expiresAt: params.expiresAt ?? null,
        status: "ACTIVE",
        operatorId: params.operatorId ?? null,
        title: params.title,
        remark: params.remark ?? null,
        updatedAt: now,
      },
    });

    let balanceAfter: number;
    if (params.scope === "WALLET") {
      const wallet = await tx.userwallet.upsert({
        where: { userId: params.userId as string },
        create: {
          id: crypto.randomUUID(),
          userId: params.userId as string,
          balance: BigInt(points),
          updatedAt: now,
        },
        update: { balance: { increment: BigInt(points) }, updatedAt: now },
      });
      balanceAfter = Number(wallet.balance);
    } else {
      const quota = await tx.workspacequota.findUnique({
        where: { workspaceId: params.workspaceId as string },
      });
      if (quota && quota.tokenBalance === BigInt(UNLIMITED_BALANCE)) {
        // 无限额度空间：保持 -1，不做加法
        balanceAfter = UNLIMITED_BALANCE;
      } else {
        const updated = await tx.workspacequota.update({
          where: { workspaceId: params.workspaceId as string },
          data: { tokenBalance: { increment: BigInt(points) }, updatedAt: now },
        });
        balanceAfter = Number(updated.tokenBalance);
      }
    }

    const ledger = await tx.pointledger.create({
      data: {
        id: crypto.randomUUID(),
        direction: "IN",
        type: params.type,
        scope: params.scope,
        userId: params.userId ?? null,
        userEmail: params.userEmail ?? null,
        workspaceId: params.scope === "WALLET" ? null : params.workspaceId ?? null,
        workspaceType: params.workspaceType ?? null,
        workspaceName: params.workspaceName ?? null,
        operatorId: params.operatorId ?? null,
        points: BigInt(points),
        balanceAfter: BigInt(balanceAfter),
        amountCents: Math.round(params.amountCents || 0),
        paymentMethod: params.paymentMethod ?? null,
        orderNo: params.orderNo ?? null,
        grantId: grant.id,
        componentId: params.componentId ?? null,
        componentName: params.componentName ?? null,
        taskId: params.taskId ?? null,
        title: params.title,
        remark: params.remark ?? null,
        idempotencyKey: params.idempotencyKey ? `${params.idempotencyKey}#1` : null,
      },
    });

    return { skipped: false, ledgerId: ledger.id, grantId: grant.id, balanceAfter };
  });
}

/**
 * 消耗算力点：按「到期最早优先」逐桶扣减 + 写出账流水（幂等，余额不足整笔回滚）
 */
export async function consumePoints(params: ConsumeParams): Promise<ConsumeResult> {
  const need = Math.floor(Number(params.points) || 0);
  if (need <= 0) {
    const b = await readBalances(prisma, params.userId, params.workspaceId);
    return {
      skipped: true,
      unlimited: false,
      consumed: 0,
      ledgerIds: [],
      details: [],
      balanceAfter: b.wallet + (b.workspace === UNLIMITED_BALANCE ? 0 : b.workspace),
    };
  }

  if (params.idempotencyKey) {
    const exist = await prisma.pointledger.findFirst({
      where: { idempotencyKey: { startsWith: `${params.idempotencyKey}#` } },
      orderBy: { createdAt: "asc" },
    });
    if (exist) {
      const b = await readBalances(prisma, params.userId, params.workspaceId);
      return {
        skipped: true,
        unlimited: false,
        consumed: Number(exist.points),
        ledgerIds: [exist.id],
        details: [],
        balanceAfter: b.wallet + (b.workspace === UNLIMITED_BALANCE ? 0 : b.workspace),
      };
    }
  }

  return prisma.$transaction(async (tx) => {
    const now = new Date();

    // 1. 先清掉已到期的分桶，避免过期点被继续消耗
    await expireGrantsInTx(tx, params.userId, params.workspaceId);

    // 2. 无限额度空间：不扣减，仅记录用量流水
    const quota = await tx.workspacequota.findUnique({
      where: { workspaceId: params.workspaceId },
    });
    if (quota && quota.tokenBalance === BigInt(UNLIMITED_BALANCE)) {
      const ledger = await tx.pointledger.create({
        data: {
          id: crypto.randomUUID(),
          direction: "OUT",
          type: "CONSUME",
          scope: "WORKSPACE",
          userId: params.userId,
          userEmail: params.userEmail ?? null,
          workspaceId: params.workspaceId,
          workspaceType: params.workspaceType ?? null,
          workspaceName: params.workspaceName ?? null,
          operatorId: params.userId,
          points: BigInt(need),
          balanceAfter: BigInt(UNLIMITED_BALANCE),
          componentId: params.componentId ?? null,
          componentName: params.componentName ?? null,
          taskId: params.taskId ?? null,
          title: params.componentName
            ? `组件消耗：${params.componentName}`
            : "组件算力消耗",
          remark: "无限额度空间，本次不计扣余额",
          idempotencyKey: params.idempotencyKey ? `${params.idempotencyKey}#1` : null,
        },
      });
      return {
        skipped: false,
        unlimited: true,
        consumed: need,
        ledgerIds: [ledger.id],
        details: [],
        balanceAfter: Number.MAX_SAFE_INTEGER,
      };
    }

    // 3. 取当前上下文可用的分桶：用户钱包（跨空间）+ 当前空间共享池/专属赠送
    const buckets = await tx.pointgrant.findMany({
      where: {
        status: "ACTIVE",
        remaining: { gt: 0 },
        OR: [
          { scope: "WALLET", userId: params.userId },
          {
            scope: { in: ["WORKSPACE", "PERSONAL_GIFT"] },
            workspaceId: params.workspaceId,
          },
        ],
        AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }],
      },
    });

    // 到期早的先扣；无到期日的排最后；同到期时间按创建时间
    buckets.sort((a, b) => {
      if (!a.expiresAt && !b.expiresAt) return a.createdAt.getTime() - b.createdAt.getTime();
      if (!a.expiresAt) return 1;
      if (!b.expiresAt) return -1;
      return a.expiresAt.getTime() - b.expiresAt.getTime();
    });

    const available = buckets.reduce((sum, b) => sum + Number(b.remaining), 0);
    if (available < need) {
      throw new InsufficientPointsError(available, need);
    }

    let left = need;
    const details: ConsumeResult["details"] = [];
    const ledgerIds: string[] = [];
    let index = 0;

    for (const bucket of buckets) {
      if (left <= 0) break;
      const remain = Number(bucket.remaining);
      const take = Math.min(remain, left);
      index += 1;

      await tx.pointgrant.update({
        where: { id: bucket.id },
        data: {
          remaining: BigInt(remain - take),
          status: remain - take <= 0 ? "EXHAUSTED" : "ACTIVE",
          updatedAt: now,
        },
      });

      let balanceAfter = 0;
      if (bucket.scope === "WALLET" && bucket.userId) {
        const w = await tx.userwallet.update({
          where: { userId: bucket.userId },
          data: { balance: { decrement: BigInt(take) }, updatedAt: now },
        });
        balanceAfter = Number(w.balance);
      } else if (bucket.workspaceId) {
        const q = await tx.workspacequota.update({
          where: { workspaceId: bucket.workspaceId },
          data: { tokenBalance: { decrement: BigInt(take) }, updatedAt: now },
        });
        balanceAfter = Number(q.tokenBalance);
      }

      const ledger = await tx.pointledger.create({
        data: {
          id: crypto.randomUUID(),
          direction: "OUT",
          type: "CONSUME",
          scope: bucket.scope,
          userId: params.userId,
          userEmail: params.userEmail ?? null,
          workspaceId: bucket.workspaceId ?? params.workspaceId,
          workspaceType: params.workspaceType ?? null,
          workspaceName: params.workspaceName ?? null,
          operatorId: params.userId,
          points: BigInt(take),
          balanceAfter: BigInt(balanceAfter),
          componentId: params.componentId ?? null,
          componentName: params.componentName ?? null,
          taskId: params.taskId ?? null,
          grantId: bucket.id,
          title: params.componentName
            ? `组件消耗：${params.componentName}`
            : "组件算力消耗",
          remark: params.remark ?? null,
          idempotencyKey: params.idempotencyKey
            ? `${params.idempotencyKey}#${index}`
            : null,
        },
      });

      details.push({
        grantId: bucket.id,
        scope: bucket.scope,
        sourceType: bucket.sourceType,
        points: take,
      });
      ledgerIds.push(ledger.id);
      left -= take;
    }

    if (left > 0) {
      throw new InsufficientPointsError(available, need);
    }

    const b = await readBalances(tx, params.userId, params.workspaceId);
    return {
      skipped: false,
      unlimited: false,
      consumed: need,
      ledgerIds,
      details,
      balanceAfter: b.wallet + (b.workspace === UNLIMITED_BALANCE ? 0 : b.workspace),
    };
  });
}

/**
 * 退还算力点（任务失败/冲正）：退回用户钱包，永不过期
 */
export async function refundPoints(params: {
  userId: string;
  points: number;
  taskId?: string | null;
  componentId?: string | null;
  componentName?: string | null;
  operatorId?: string | null;
  reason?: string | null;
  idempotencyKey?: string | null;
}): Promise<GrantResult> {
  return grantPoints({
    scope: "WALLET",
    userId: params.userId,
    points: params.points,
    sourceType: "REFUND",
    type: "REFUND",
    title: params.componentName
      ? `算力退回：${params.componentName}`
      : "算力退回",
    componentId: params.componentId ?? null,
    componentName: params.componentName ?? null,
    taskId: params.taskId ?? null,
    operatorId: params.operatorId ?? null,
    remark: params.reason ?? null,
    idempotencyKey: params.idempotencyKey ?? null,
  });
}

/**
 * 后台人工调整（可正可负）：正数发放至目标账户，负数从可用分桶扣减
 */
export async function adjustPoints(params: {
  scope: PointScope;
  userId?: string | null;
  workspaceId?: string | null;
  points: number;
  operatorId: string;
  reason: string;
  workspaceType?: string | null;
  workspaceName?: string | null;
  idempotencyKey?: string | null;
}): Promise<GrantResult> {
  const points = Math.floor(Number(params.points) || 0);
  if (points === 0) throw new Error("调整点数不能为 0");

  if (points > 0) {
    return grantPoints({
      scope: params.scope,
      userId: params.userId ?? null,
      workspaceId: params.workspaceId ?? null,
      points,
      sourceType: "MANUAL",
      type: "MANUAL_ADJUST",
      title: "平台人工补发算力点",
      operatorId: params.operatorId,
      remark: params.reason,
      workspaceType: params.workspaceType ?? null,
      workspaceName: params.workspaceName ?? null,
      paymentMethod: "MANUAL",
      idempotencyKey: params.idempotencyKey ?? null,
    });
  }

  // 负数：按到期优先从可用分桶扣减
  const deduct = Math.abs(points);
  const now = new Date();
  const buckets = await prisma.pointgrant.findMany({
    where: {
      status: "ACTIVE",
      remaining: { gt: 0 },
      ...(params.scope === "WALLET"
        ? { scope: "WALLET", userId: params.userId ?? "" }
        : { scope: params.scope, workspaceId: params.workspaceId ?? "" }),
      AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }],
    },
  });
  buckets.sort((a, b) => {
    if (!a.expiresAt && !b.expiresAt) return a.createdAt.getTime() - b.createdAt.getTime();
    if (!a.expiresAt) return 1;
    if (!b.expiresAt) return -1;
    return a.expiresAt.getTime() - b.expiresAt.getTime();
  });

  const available = buckets.reduce((s, b) => s + Number(b.remaining), 0);
  if (available < deduct) throw new InsufficientPointsError(available, deduct);

  return prisma.$transaction(async (tx) => {
    let left = deduct;
    let balanceAfter = 0;
    let firstLedgerId = "";
    let grantId = "";
    let index = 0;

    for (const bucket of buckets) {
      if (left <= 0) break;
      const remain = Number(bucket.remaining);
      const take = Math.min(remain, left);
      index += 1;

      await tx.pointgrant.update({
        where: { id: bucket.id },
        data: {
          remaining: BigInt(remain - take),
          status: remain - take <= 0 ? "EXHAUSTED" : "ACTIVE",
          updatedAt: new Date(),
        },
      });

      if (bucket.scope === "WALLET" && bucket.userId) {
        const w = await tx.userwallet.update({
          where: { userId: bucket.userId },
          data: { balance: { decrement: BigInt(take) }, updatedAt: new Date() },
        });
        balanceAfter = Number(w.balance);
      } else if (bucket.workspaceId) {
        const q = await tx.workspacequota.update({
          where: { workspaceId: bucket.workspaceId },
          data: { tokenBalance: { decrement: BigInt(take) }, updatedAt: new Date() },
        });
        balanceAfter = Number(q.tokenBalance);
      }

      const ledger = await tx.pointledger.create({
        data: {
          id: crypto.randomUUID(),
          direction: "OUT",
          type: "MANUAL_ADJUST",
          scope: bucket.scope,
          userId: params.userId ?? bucket.userId ?? null,
          workspaceId: bucket.workspaceId ?? null,
          workspaceType: params.workspaceType ?? null,
          workspaceName: params.workspaceName ?? null,
          operatorId: params.operatorId,
          points: BigInt(take),
          balanceAfter: BigInt(balanceAfter),
          grantId: bucket.id,
          paymentMethod: "MANUAL",
          title: "平台人工扣减算力点",
          remark: params.reason,
          idempotencyKey: params.idempotencyKey
            ? `${params.idempotencyKey}#${index}`
            : null,
        },
      });
      if (!firstLedgerId) {
        firstLedgerId = ledger.id;
        grantId = bucket.id;
      }
      left -= take;
    }

    return { skipped: false, ledgerId: firstLedgerId, grantId, balanceAfter };
  });
}

/** 事务内到期清算：把已过期仍有剩余的桶清零并写出账流水 */
async function expireGrantsInTx(
  tx: Prisma.TransactionClient,
  userId?: string | null,
  workspaceId?: string | null,
): Promise<number> {
  const now = new Date();
  const orConditions: Prisma.pointgrantWhereInput[] = [];
  if (userId) orConditions.push({ scope: "WALLET", userId });
  if (workspaceId) {
    orConditions.push({ scope: { in: ["WORKSPACE", "PERSONAL_GIFT"] }, workspaceId });
  }

  const expired = await tx.pointgrant.findMany({
    where: {
      status: "ACTIVE",
      remaining: { gt: 0 },
      expiresAt: { lte: now },
      ...(orConditions.length ? { OR: orConditions } : {}),
    },
  });

  let total = 0;
  for (const grant of expired) {
    const remain = Number(grant.remaining);
    if (remain <= 0) continue;

    await tx.pointgrant.update({
      where: { id: grant.id },
      data: { remaining: BigInt(0), status: "EXPIRED", updatedAt: now },
    });

    let balanceAfter = 0;
    if (grant.scope === "WALLET" && grant.userId) {
      const w = await tx.userwallet.update({
        where: { userId: grant.userId },
        data: { balance: { decrement: BigInt(remain) }, updatedAt: now },
      });
      balanceAfter = Number(w.balance);
    } else if (grant.workspaceId) {
      const quota = await tx.workspacequota.findUnique({
        where: { workspaceId: grant.workspaceId },
      });
      if (quota && quota.tokenBalance !== BigInt(UNLIMITED_BALANCE)) {
        const q = await tx.workspacequota.update({
          where: { workspaceId: grant.workspaceId },
          data: { tokenBalance: { decrement: BigInt(remain) }, updatedAt: now },
        });
        balanceAfter = Number(q.tokenBalance);
      } else {
        balanceAfter = UNLIMITED_BALANCE;
      }
    }

    await tx.pointledger.create({
      data: {
        id: crypto.randomUUID(),
        direction: "OUT",
        type: "GIFT_EXPIRE",
        scope: grant.scope,
        userId: grant.userId ?? null,
        workspaceId: grant.workspaceId ?? null,
        operatorId: null,
        points: BigInt(remain),
        balanceAfter: BigInt(balanceAfter),
        grantId: grant.id,
        paymentMethod: "SYSTEM",
        title: "赠送算力点到期清零",
        remark: grant.expiresAt
          ? `该笔算力点已于 ${grant.expiresAt.toLocaleDateString("zh-CN")} 到期，未使用部分自动清零`
          : null,
      },
    });

    total += remain;
  }
  return total;
}

/** 对外：清理已到期的算力分桶，返回被清零的点数 */
export async function expireExpiredGrants(opts?: {
  userId?: string | null;
  workspaceId?: string | null;
}): Promise<number> {
  if (!opts?.userId && !opts?.workspaceId) {
    // 全局清算（定时任务/管理端触发）
    return prisma.$transaction((tx) => expireGrantsInTx(tx, null, null), {
      // 网络盘/慢文件系统下清算可能超过默认 5s，放宽事务超时（P2028）
      timeout: 60000,
      maxWait: 10000,
    });
  }
  return prisma.$transaction(
    (tx) => expireGrantsInTx(tx, opts?.userId ?? null, opts?.workspaceId ?? null),
    { timeout: 60000, maxWait: 10000 },
  );
}

export interface BalanceSummary {
  /** 用户钱包余额（跨空间通用） */
  walletBalance: number;
  /** 当前空间共享池余额 */
  workspaceBalance: number;
  /** 当前上下文可用总额（无限额度时为 null） */
  available: number | null;
  unlimited: boolean;
  /** 即将过期的点数（EXPIRE_REMIND_DAYS 内） */
  expiringPoints: number;
  expiringAt: string | null;
  /** 各来源剩余明细 */
  breakdown: Array<{
    scope: string;
    sourceType: string;
    remaining: number;
    expiresAt: string | null;
  }>;
}

/** 读取用户/空间余额概览（含到期提醒，读取前自动清算过期分桶） */
export async function getBalanceSummary(
  userId: string,
  workspaceId?: string | null,
): Promise<BalanceSummary> {
  await expireExpiredGrants({ userId, workspaceId: workspaceId ?? null });

  const wallet = await prisma.userwallet.findUnique({ where: { userId } });
  const walletBalance = wallet ? Number(wallet.balance) : 0;

  let workspaceBalance = 0;
  let unlimited = false;
  if (workspaceId) {
    const quota = await prisma.workspacequota.findUnique({ where: { workspaceId } });
    if (quota) {
      unlimited = quota.tokenBalance === BigInt(UNLIMITED_BALANCE);
      workspaceBalance = Number(quota.tokenBalance);
    }
  }

  const soon = new Date(Date.now() + EXPIRE_REMIND_DAYS * 24 * 60 * 60 * 1000);
  const grants = await prisma.pointgrant.findMany({
    where: {
      status: "ACTIVE",
      remaining: { gt: 0 },
      OR: [{ scope: "WALLET", userId }, ...(workspaceId ? [{ workspaceId }] : [])],
    },
    orderBy: { expiresAt: "asc" },
  });

  let expiringPoints = 0;
  let expiringAt: string | null = null;
  for (const g of grants) {
    if (g.expiresAt && g.expiresAt.getTime() <= soon.getTime()) {
      expiringPoints += Number(g.remaining);
      if (!expiringAt) expiringAt = g.expiresAt.toISOString();
    }
  }

  return {
    walletBalance,
    workspaceBalance,
    available: unlimited ? null : walletBalance + workspaceBalance,
    unlimited,
    expiringPoints,
    expiringAt,
    breakdown: grants.map((g) => ({
      scope: g.scope,
      sourceType: g.sourceType,
      remaining: Number(g.remaining),
      expiresAt: g.expiresAt ? g.expiresAt.toISOString() : null,
    })),
  };
}

/**
 * 注册福利发放：注册当月起连续 REGISTER_GIFT_MONTHS(=3) 个自然月，每月发放
 * NEW_USER_GIFT_POINTS(=100) 点至个人空间专属桶（PERSONAL_GIFT）。
 * - 当月有效：每笔到期时间为下月 1 日 0 点，当月未用完自动清零，不跨月累计；
 * - 按月幂等：idempotencyKey = GIFT_REGISTER:{userId}:{yyyy-MM}，同月重复调用自动跳过；
 * - 超窗停发：注册当月（含）之后的第 4 个自然月起不再发放，用尽请自行充值。
 */
export async function grantNewUserGift(params: {
  userId: string;
  workspaceId: string;
  workspaceName?: string | null;
  userEmail?: string | null;
}): Promise<GrantResult> {
  const skippedResult: GrantResult = {
    skipped: true,
    ledgerId: "",
    grantId: "",
    balanceAfter: 0,
  };

  const user = await prisma.user.findUnique({
    where: { id: params.userId },
    select: { createdAt: true },
  });
  if (!user) return skippedResult;

  const now = new Date();
  // 注册月与当前月按「自然月序号」比较
  const regMonth = user.createdAt.getFullYear() * 12 + user.createdAt.getMonth();
  const curMonth = now.getFullYear() * 12 + now.getMonth();
  const monthIndex = curMonth - regMonth; // 0=注册当月, 1=第 2 个月, 2=第 3 个月
  if (monthIndex < 0 || monthIndex >= REGISTER_GIFT_MONTHS) {
    // 注册前（数据异常）或注册满 3 个月后：永久停发
    return skippedResult;
  }

  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  // 当月福利月底清零：到期 = 次月 1 日 0 点整
  const expiresAt = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);

  return grantPoints({
    scope: "PERSONAL_GIFT",
    userId: params.userId,
    workspaceId: params.workspaceId,
    points: NEW_USER_GIFT_POINTS,
    sourceType: "GIFT_REGISTER",
    type: "GIFT_REGISTER",
    title: `注册福利 ${NEW_USER_GIFT_POINTS} 算力点（第 ${monthIndex + 1}/${REGISTER_GIFT_MONTHS} 个月）`,
    expiresAt,
    workspaceType: "PERSONAL",
    workspaceName: params.workspaceName ?? null,
    userEmail: params.userEmail ?? null,
    paymentMethod: "SYSTEM",
    remark: `注册福利：注册当月起连续 ${REGISTER_GIFT_MONTHS} 个月每月赠送 ${NEW_USER_GIFT_POINTS} 点，当月有效、月底未用完自动清零，仅限个人空间使用；第 ${REGISTER_GIFT_MONTHS} 个月结束后不再赠送，用完请自行充值`,
    idempotencyKey: `GIFT_REGISTER:${params.userId}:${ym}`,
  });
}

/**
 * 企业共享池回收至个人钱包（单事务原子记账，供空间内回收与平台后台代回收共用）。
 * 要求：目标 workspace 必须为 ENTERPRISE；userId 为接收钱包的所有者。
 * 记账：企业池递减 + 个人钱包递增 + 新建 WALLET 分桶（保证点数可正常花费）+ 双向流水。
 */
export async function recycleEnterprisePool(params: {
  workspaceId: string;
  userId: string;
  points: number;
  operatorId?: string | null;
}): Promise<{ walletBalance: number; poolBalance: number }> {
  const amount = Math.floor(Number(params.points));
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("INVALID_AMOUNT");

  return prisma.$transaction(async (tx) => {
    const ws = await tx.workspace.findUnique({
      where: { id: params.workspaceId },
      select: { id: true, name: true, type: true },
    });
    if (ws?.type !== "ENTERPRISE") throw new Error("NOT_ENTERPRISE");

    const quota = await tx.workspacequota.findUnique({
      where: { workspaceId: params.workspaceId },
      select: { tokenBalance: true },
    });
    const current = Number(quota?.tokenBalance ?? 0);
    if (current === -1) throw new Error("UNLIMITED");
    if (current < amount) throw new Error("INSUFFICIENT");

    // 1. 企业共享池递减
    await tx.workspacequota.update({
      where: { workspaceId: params.workspaceId },
      data: { tokenBalance: { decrement: BigInt(amount) }, updatedAt: new Date() },
    });

    // 2. 个人钱包递增（不存在则创建）
    const wallet = await tx.userwallet.upsert({
      where: { userId: params.userId },
      create: {
        id: crypto.randomUUID(),
        userId: params.userId,
        balance: BigInt(amount),
        updatedAt: new Date(),
      },
      update: { balance: { increment: BigInt(amount) }, updatedAt: new Date() },
    });

    // 3. 个人钱包侧新建 WALLET 分桶，确保回收点数可正常花费
    const grant = await tx.pointgrant.create({
      data: {
        id: crypto.randomUUID(),
        scope: "WALLET",
        userId: params.userId,
        points: BigInt(amount),
        remaining: BigInt(amount),
        sourceType: "MANUAL",
        sourceId: `RECYCLE:${params.workspaceId}:${Date.now()}`,
        status: "ACTIVE",
        operatorId: params.operatorId ?? null,
        title: `企业池回收 ${amount.toLocaleString()} 算力点至个人钱包`,
        remark: `从企业空间「${ws.name || params.workspaceId}」回收`,
        updatedAt: new Date(),
      },
    });

    // 4. 双向流水记账（OUT 企业池 / IN 个人钱包）
    await tx.pointledger.create({
      data: {
        id: crypto.randomUUID(),
        direction: "OUT",
        type: "MANUAL_ADJUST",
        scope: "WORKSPACE",
        userId: params.userId,
        workspaceId: params.workspaceId,
        workspaceType: ws.type,
        workspaceName: ws.name,
        operatorId: params.operatorId ?? null,
        points: BigInt(amount),
        balanceAfter: BigInt(current - amount),
        grantId: null,
        title: `企业池回收 ${amount.toLocaleString()} 算力点至个人钱包`,
        remark: `从企业空间「${ws.name || params.workspaceId}」回收至个人钱包`,
      },
    });
    await tx.pointledger.create({
      data: {
        id: crypto.randomUUID(),
        direction: "IN",
        type: "MANUAL_ADJUST",
        scope: "WALLET",
        userId: params.userId,
        workspaceId: null,
        workspaceType: null,
        workspaceName: null,
        operatorId: params.operatorId ?? null,
        points: BigInt(amount),
        balanceAfter: wallet.balance,
        grantId: grant.id,
        title: `企业池回收 ${amount.toLocaleString()} 算力点至个人钱包`,
        remark: `来自企业空间「${ws.name || params.workspaceId}」`,
      },
    });

    return { walletBalance: Number(wallet.balance), poolBalance: current - amount };
  });
}
