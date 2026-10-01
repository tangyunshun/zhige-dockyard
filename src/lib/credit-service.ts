import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { addNotification } from "@/lib/notifications-store";

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
/** 真实模型失败退款幂等键前缀（按「任务ID:来源分桶序号」生成唯一键，防止重复退款） */
export const REFUND_MODEL_FAILURE_PREFIX = "REFUND_MODEL_FAILURE";

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

/** 幂等命中但无法从账务流水安全还原完整消费详情：禁止自动退款，转入人工对账 */
export class IdempotencyStateUnknownError extends Error {
  idempotencyKey: string;
  constructor(idempotencyKey: string) {
    super(`消费幂等键 ${idempotencyKey} 命中，但无法从账务流水还原完整消费详情，已禁止自动退款，需人工对账。`);
    this.name = "IdempotencyStateUnknownError";
    this.idempotencyKey = idempotencyKey;
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

/** 扣点明细来源分桶类型（用于原路退款区分归属，禁止一律退回钱包） */
export type ConsumeDetailKind = "WALLET" | "PERSONAL_GIFT" | "WORKSPACE" | "MEMBER";

export interface ConsumeDetail {
  /** 扣减产生的对应 pointledger 流水 ID */
  ledgerId: string;
  grantId: string;
  scope: string;
  sourceType: string;
  points: number;
  /** 来源分桶归属：WALLET 用户钱包 | PERSONAL_GIFT 个人赠送 | WORKSPACE 空间共享池 | MEMBER 企业成员独立余额 */
  kind: ConsumeDetailKind;
}

export interface ConsumeResult {
  skipped: boolean;
  unlimited: boolean;
  consumed: number;
  ledgerIds: string[];
  /** 各分桶扣减明细（区分钱包/赠送/共享池/成员余额，支撑原路退款） */
  details: ConsumeDetail[];
  /** 扣减后账户可用余额（钱包 + 空间池） */
  balanceAfter: number;
  /** 本次扣点同步增加的成员月度已用额度（用于退款时回滚；无成员记录则为 0） */
  monthlyTokenUsedIncremented: number;
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
 * 从同一消费幂等键的全部账务流水重建完整 ConsumeResult（用于幂等命中重入）。
 *
 * 安全约束：不得伪造空 details。若无法安全还原（无流水 / 金额非法）返回 null；
 * 若流水存在但结构无法解释，抛 IdempotencyStateUnknownError 供调用方转入人工对账。
 */
export async function reconstructConsumeResult(
  idempotencyKey: string,
  userId: string,
  workspaceId: string,
): Promise<ConsumeResult | null> {
  const prefix = `${idempotencyKey}#`;
  // 必须同时限定 userId / workspaceId / direction / type，避免跨账户串号
  const ledgers = await prisma.pointledger.findMany({
    where: {
      idempotencyKey: { startsWith: prefix },
      userId,
      workspaceId,
      direction: "OUT",
      type: "CONSUME",
    },
    orderBy: { createdAt: "asc" },
  });
  if (ledgers.length === 0) return null;

  const unknown = () => new IdempotencyStateUnknownError(idempotencyKey);

  // 幂等序号连续性校验（#1、#2 … 无缺口）
  const seq = ledgers.map((l) => {
    const suffix = (l.idempotencyKey || "").slice(prefix.length);
    const n = Number(suffix);
    return Number.isSafeInteger(n) ? n : NaN;
  });
  const sortedSeq = [...seq].sort((a, b) => a - b);
  for (let i = 0; i < sortedSeq.length; i += 1) {
    if (sortedSeq[i] !== i + 1) throw unknown();
  }

  // 金额必须为安全正整数
  for (const l of ledgers) {
    const p = Number(l.points);
    if (!Number.isSafeInteger(p) || p <= 0) throw unknown();
  }

  const consumed = ledgers.reduce((s, l) => s + Number(l.points), 0);
  const unlimited = ledgers.some((l) => Number(l.balanceAfter) === UNLIMITED_BALANCE);
  const ledgerIds = ledgers.map((l) => l.id);

  // balanceAfter 由当前真实余额计算（不直接取最后一条流水的快照）
  const balance = await readBalances(prisma, userId, workspaceId);
  const balanceAfter = unlimited
    ? UNLIMITED_BALANCE
    : balance.wallet + (balance.workspace === UNLIMITED_BALANCE ? 0 : balance.workspace);

  // 月度用量增量：从持久化的 CONSUME 流水金额恢复（不依赖当前成员记录是否存在）
  const monthlyTokenUsedIncremented = consumed;

  if (unlimited) {
    return {
      skipped: false,
      unlimited: true,
      consumed,
      ledgerIds,
      details: [],
      balanceAfter,
      monthlyTokenUsedIncremented,
    };
  }

  const allowedScopes: ConsumeDetailKind[] = ["WALLET", "PERSONAL_GIFT", "WORKSPACE"];
  const details: ConsumeDetail[] = [];
  for (const l of ledgers) {
    const points = Number(l.points);
    const grantId = l.grantId ?? "";
    if (!grantId) {
      // MEMBER 分支（企业成员独立余额）不写 grantId，scope 必须为 WORKSPACE
      if (l.scope !== "WORKSPACE") throw unknown();
      details.push({ ledgerId: l.id, grantId: "", scope: "WORKSPACE", sourceType: "MEMBER", points, kind: "MEMBER" });
      continue;
    }
    const scope = String(l.scope) as ConsumeDetailKind;
    if (!allowedScopes.includes(scope)) throw unknown();
    // sourceType 从原始分桶真实恢复（不能直接用 scope 代替）
    const grant = await prisma.pointgrant.findUnique({
      where: { id: grantId },
      select: { sourceType: true },
    });
    details.push({ ledgerId: l.id, grantId, scope, sourceType: grant?.sourceType || scope, points, kind: scope });
  }

  return {
    skipped: false,
    unlimited: false,
    consumed,
    ledgerIds,
    details,
    balanceAfter,
    monthlyTokenUsedIncremented,
  };
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
      monthlyTokenUsedIncremented: 0,
    };
  }

  if (params.idempotencyKey) {
    // 幂等命中：必须返回原始完整消费信息（不得伪造空 details），否则后续退款会静默跳过
    const reconstructed = await reconstructConsumeResult(
      params.idempotencyKey,
      params.userId,
      params.workspaceId,
    );
    if (reconstructed) return reconstructed;
  }

  try {
    return await prisma.$transaction(async (tx) => {
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
      const monthlyTokenUsedIncrementedUnlimited = await bumpMemberMonthlyUsed(
        tx,
        params.userId,
        params.workspaceId,
        need,
      );
      return {
        skipped: false,
        unlimited: true,
        consumed: need,
        ledgerIds: [ledger.id],
        details: [{
          ledgerId: ledger.id,
          grantId: "",
          scope: "WORKSPACE",
          sourceType: "UNLIMITED",
          points: need,
          kind: "WORKSPACE",
        }],
        balanceAfter: Number.MAX_SAFE_INTEGER,
        monthlyTokenUsedIncremented: monthlyTokenUsedIncrementedUnlimited,
      };
    }

      const deductRes = await deductPointsInTx(tx, {
        userId: params.userId,
        workspaceId: params.workspaceId,
        workspaceType: params.workspaceType,
        workspaceName: params.workspaceName,
        userEmail: params.userEmail,
        need,
        taskId: params.taskId,
        componentId: params.componentId,
        componentName: params.componentName,
        title: params.componentName ? `组件消耗：${params.componentName}` : "组件算力消耗",
        remark: params.remark,
        idempotencyPrefix: params.idempotencyKey,
        bumpMonthlyUsed: true,
      });

      return {
        skipped: false,
        unlimited: false,
        ...deductRes,
      };
    });
  } catch (e) {
    // 并发相同幂等请求：唯一约束冲突（P2002）时从流水还原并返回，避免重复扣费
    if (params.idempotencyKey && (e as { code?: string })?.code === "P2002") {
      const reconstructed = await reconstructConsumeResult(
        params.idempotencyKey,
        params.userId,
        params.workspaceId,
      );
      if (reconstructed) return reconstructed;
    }
    throw e;
  }
}

/**
 * 同步增加成员当月已用额度（monthlyTokenUsed 唯一权威写入位置）。
 * 仅当存在 workspacemember 记录时生效，返回实际增加的点数（无记录则 0）。
 */
async function bumpMemberMonthlyUsed(
  tx: Prisma.TransactionClient,
  userId: string,
  workspaceId: string,
  points: number,
): Promise<number> {
  if (points <= 0) return 0;
  const res = await tx.workspacemember.updateMany({
    where: { userId, workspaceId },
    data: { monthlyTokenUsed: { increment: BigInt(points) } },
  });
  return res.count > 0 ? points : 0;
}

export interface DeductPointsParams {
  userId: string;
  workspaceId: string;
  workspaceType?: string | null;
  workspaceName?: string | null;
  userEmail?: string | null;
  need: number;
  taskId?: string | null;
  componentId?: string | null;
  componentName?: string | null;
  title?: string | null;
  remark?: string | null;
  idempotencyPrefix?: string | null;
  bumpMonthlyUsed?: boolean;
}

export interface DeductPointsResult {
  consumed: number;
  ledgerIds: string[];
  details: ConsumeDetail[];
  balanceAfter: number;
  monthlyTokenUsedIncremented: number;
}

/**
 * 事务内执行真实算力点扣减的核心原语（全系统唯一扣减共享实现）：
 * 1. 企业空间普通成员：严格仅从其独立余额（workspacemember.tokenBalance）扣减，累加月度用量，绝不跨界消耗共享池；
 * 2. 普通空间 / 空间所有者：取 ACTIVE 且 remaining > 0 且未过期的有效分桶（严格限制当前用户 WALLET 或当前空间 WORKSPACE/PERSONAL_GIFT）；
 * 3. 严格按到期日升序扣减（到期早的先扣；无到期日的排最后；同到期时间按创建时间升序）；
 * 4. 分桶扣尽（remaining=0）时严格将状态更新为 EXHAUSTED；
 * 5. 原子更新对应账户余额并写入 pointledger 正向消费流水。
 */
export async function deductPointsInTx(
  tx: Prisma.TransactionClient,
  params: DeductPointsParams
): Promise<DeductPointsResult> {
  const now = new Date();
  const need = params.need;

  // 1. 企业空间普通成员：仅从其独立余额扣减，不消耗共享池
  if (params.workspaceType === "ENTERPRISE") {
    const member = await tx.workspacemember.findUnique({
      where: { userId_workspaceId: { userId: params.userId, workspaceId: params.workspaceId } },
    });
    if (member && member.role === "MEMBER") {
      const memberBalance = Number(member.tokenBalance);
      if (memberBalance < need) {
        throw new InsufficientPointsError(memberBalance, need);
      }
      const updatedMember = await tx.workspacemember.update({
        where: { id: member.id },
        data: {
          tokenBalance: { decrement: BigInt(need) },
          monthlyTokenUsed: params.bumpMonthlyUsed !== false ? { increment: BigInt(need) } : undefined,
        },
      });
      const balanceAfterMember = updatedMember
        ? Number(updatedMember.tokenBalance)
        : memberBalance - need;
      const ledger = await tx.pointledger.create({
        data: {
          id: crypto.randomUUID(),
          direction: "OUT",
          type: "CONSUME",
          scope: "WORKSPACE",
          userId: params.userId,
          userEmail: params.userEmail ?? null,
          workspaceId: params.workspaceId,
          workspaceType: "ENTERPRISE",
          workspaceName: params.workspaceName ?? null,
          operatorId: params.userId,
          points: BigInt(need),
          balanceAfter: BigInt(balanceAfterMember),
          componentId: params.componentId ?? null,
          componentName: params.componentName ?? null,
          taskId: params.taskId ?? null,
          title: params.title ?? (params.componentName ? `组件消耗：${params.componentName}` : "组件算力消耗"),
          remark: params.remark ?? "成员独立余额扣减",
          idempotencyKey: params.idempotencyPrefix ? `${params.idempotencyPrefix}#1` : null,
        },
      });

      if (balanceAfterMember === 0) {
        try {
          const admins = await tx.workspacemember.findMany({
            where: { workspaceId: params.workspaceId, role: { in: ["OWNER", "ADMIN"] } },
            select: { userId: true },
          });
          const memberName = params.userEmail ?? params.userId;
          const link = `/workspace/${params.workspaceId}/members`;
          for (const a of admins) {
            await addNotification(
              a.userId,
              "成员算力余额已耗尽",
              `成员「${memberName}」的独立算力点已用尽（剩余 0 点），将无法继续执行组件任务。请前往「成员」页为其分配算力。`,
              "workspace",
              link
            );
          }
        } catch (notifyErr) {
          console.warn("[credit] 成员余额耗尽通知发送失败:", notifyErr);
        }
      }

      return {
        consumed: need,
        ledgerIds: [ledger.id],
        details: [{ ledgerId: ledger.id, grantId: "", scope: "WORKSPACE", sourceType: "MEMBER", points: need, kind: "MEMBER" }],
        balanceAfter: balanceAfterMember,
        monthlyTokenUsedIncremented: params.bumpMonthlyUsed !== false ? need : 0,
      };
    }
  }

  // 2. 取当前上下文可用的分桶：用户钱包（跨空间）+ 当前空间共享池/专属赠送，排除已过期分桶
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

  // 严格排序：到期早的先扣；无到期日的排最后；同到期时间按创建时间升序
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

    // 更新分桶剩余；扣尽时严格转为 EXHAUSTED
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
        title: params.title ?? (params.componentName ? `组件消耗：${params.componentName}` : "组件算力消耗"),
        remark: params.remark ?? null,
        idempotencyKey: params.idempotencyPrefix
          ? `${params.idempotencyPrefix}#${index}`
          : null,
      },
    });

    details.push({
      ledgerId: ledger.id,
      grantId: bucket.id,
      scope: bucket.scope,
      sourceType: bucket.sourceType,
      points: take,
      kind: bucket.scope as ConsumeDetailKind,
    });
    ledgerIds.push(ledger.id);
    left -= take;
  }

  if (left > 0) {
    throw new InsufficientPointsError(available, need);
  }

  // 同步增加成员当月已用额度
  let monthlyTokenUsedIncremented = 0;
  if (params.bumpMonthlyUsed !== false) {
    monthlyTokenUsedIncremented = await bumpMemberMonthlyUsed(
      tx,
      params.userId,
      params.workspaceId,
      need,
    );
  }

  const b = await readBalances(tx, params.userId, params.workspaceId);
  return {
    consumed: need,
    ledgerIds,
    details,
    balanceAfter: b.wallet + (b.workspace === UNLIMITED_BALANCE ? 0 : b.workspace),
    monthlyTokenUsedIncremented,
  };
}

/** 单条来源分桶的退款计划（纯函数，便于无数据库单元测试） */
export interface RefundLedgerPlan {
  kind: ConsumeDetailKind;
  points: number;
  /** 幂等键：${REFUND_MODEL_FAILURE_PREFIX}:${taskId}:${分桶序号} */
  idempotencyKey: string;
  /** 原分桶 ID（过期/缺失时为 null，将退回至同 scope 兜底分桶） */
  grantId: string | null;
  /** 原分桶已过期或缺失：必须走兜底分桶并记录审计备注，不改变余额归属 */
  expiredFallback: boolean;
}

/**
 * 根据扣点结果构建「原路退款计划」（纯函数，不触碰数据库）。
 * - 无限额度 / 跳过 / 无扣点：返回空数组（不产生任何退款点）；
 * - 按扣点明细逐来源生成幂等键（taskId + 分桶序号），顺序稳定；
 * - 通过 expiredGrantIds 标记已过期分桶，决定走兜底分桶并记录审计备注。
 */
export function planRefundLedgers(
  consumeResult: ConsumeResult,
  taskId: string,
  expiredGrantIds: Set<string> = new Set(),
): RefundLedgerPlan[] {
  if (consumeResult.skipped || consumeResult.unlimited || consumeResult.consumed <= 0) return [];
  const plans: RefundLedgerPlan[] = [];
  let index = 0;
  for (const d of consumeResult.details) {
    index += 1;
    const expiredFallback = d.kind !== "MEMBER" && (!d.grantId || expiredGrantIds.has(d.grantId));
    plans.push({
      kind: d.kind,
      points: d.points,
      idempotencyKey: `${REFUND_MODEL_FAILURE_PREFIX}:${taskId}:${index}`,
      grantId: d.kind !== "MEMBER" && !expiredFallback ? d.grantId : null,
      expiredFallback,
    });
  }
  return plans;
}

/**
 * 真实模型失败 / 任务落库失败：按「扣点来源分桶」原路退款（禁止一律退回用户钱包）。
 *
 * 退款规则：
 *  - WALLET 用户钱包分桶：恢复对应 pointgrant.remaining + userwallet.balance；
 *  - PERSONAL_GIFT 个人赠送分桶：恢复对应 pointgrant.remaining + workspacequota.tokenBalance；
 *  - WORKSPACE 企业共享池分桶：恢复对应 pointgrant.remaining + workspacequota.tokenBalance；
 *  - MEMBER 企业成员独立余额：恢复 workspacemember.tokenBalance；
 *  - 原分桶已过期或缺失：退回至同 scope 兜底分桶（钱包仍归钱包、空间池仍归空间池，不改变余额归属），
 *    并写入「原分桶已过期」审计备注，绝不静默改变余额归属；
 *  - 同步回滚本次增加的成员月度已用额度（monthlyTokenUsed），使用独立幂等键 `${REFUND_MODEL_FAILURE_PREFIX}:${taskId}:MONTHLY`；
 *  - 无限额度（unlimited=true）无真实扣点：不产生任何退款点，但会通过 points=0 的月度回滚标记回滚 monthlyTokenUsed；
 *  - 幂等：逐来源分桶键 `${REFUND_MODEL_FAILURE_PREFIX}:${taskId}:${index}` 去重；
 *    若本次所有来源退款流水均已存在，则完全跳过月度回滚；月度回滚标记存在时亦跳过，
 *    同一失败路径重复进入不会重复增加余额，也不会重复回滚月度用量；
 *  - 月度用量回滚保护下限为 0，不会回滚成负数；
 *  - 余额增加、退款流水写入、月度用量回滚、幂等标记写入在同一事务内，要么全部成功要么全部回滚。
 */
export const MAX_REFUND_RETRIES = 3;

export class RefundAccountNotFoundError extends Error {
  code = "REFUND_ACCOUNT_NOT_FOUND";
  constructor(message: string) {
    super(message);
    this.name = "RefundAccountNotFoundError";
  }
}

/**
 * 仅判定 Prisma 的 P2034（写冲突/死锁）为可安全重试异常；
 * 严格禁止仅凭 message 包含 P2034 进行宽松判定，业务错误、校验错误、数据完整性错误严格禁止重试。
 */
export function isRetryableP2034(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034") {
    return true;
  }
  if ("code" in err && (err as { code?: unknown }).code === "P2034") {
    return true;
  }
  return false;
}

class SimulatedP2034Error extends Error {
  code = "P2034";
  constructor(message = "Simulated write conflict or deadlock (P2034)") {
    super(message);
    this.name = "PrismaClientKnownRequestError";
  }
}

async function backoffForRetry(attempt: number): Promise<void> {
  const isTest = process.env.NODE_ENV === "test" || Boolean(process.env.TEST_FAST_BACKOFF);
  const base = isTest ? 5 * Math.pow(2, attempt - 1) : 25 * Math.pow(2, attempt - 1);
  const jitter = Math.floor(Math.random() * (isTest ? 5 : 25));
  await new Promise((resolve) => setTimeout(resolve, base + jitter));
}

async function executeRefundTx(
  params: {
    consumeResult: ConsumeResult;
    userId: string;
    workspaceId: string;
    taskId?: string | null;
    componentId?: string | null;
    componentName?: string | null;
    operatorId?: string | null;
    workspaceType?: string | null;
    workspaceName?: string | null;
    userEmail?: string | null;
  },
  testState?: { injectedCount: number; maxInjections: number },
): Promise<{ refunded: number }> {
  const cr = params.consumeResult;
  const plans = planRefundLedgers(cr, params.taskId ?? "");
  const kinds = new Set(plans.map((p) => p.kind));

  // 1. 锁定对象必须由 ConsumeResult.details 实际分桶及月度回滚共同决定，不依赖未持久化的 workspaceType
  const needWalletLock = kinds.has("WALLET");
  const needQuotaLock = kinds.has("WORKSPACE") || kinds.has("PERSONAL_GIFT");
  const needMemberLock =
    kinds.has("MEMBER") ||
    (typeof cr.monthlyTokenUsedIncremented === "number" && cr.monthlyTokenUsedIncremented > 0);

  return prisma.$transaction(
    async (tx) => {
      const now = new Date();
      let refunded = 0;
      let newlyProcessed = 0;

      // 2. 多分桶事务必须按全局固定顺序加锁（userwallet -> workspacequota -> workspacemember），
      // 避免并发不同任务出现 AB-BA 交叉死锁；所有账户锁必须先于 pointgrant、pointledger 和余额写入。
      // 3. 明确缺失账户行强校验：所需账户行缺失时，严禁创建成功退款流水，必须抛出 REFUND_ACCOUNT_NOT_FOUND，
      // 保证整笔事务全部回滚，严禁用 upsert 静默创建配额掩盖账务缺失。
      if (needWalletLock) {
        const wallets = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT \`id\` FROM \`userwallet\` WHERE \`userId\` = ${params.userId} FOR UPDATE
        `;
        if (wallets.length === 0) {
          throw new RefundAccountNotFoundError(
            `REFUND_ACCOUNT_NOT_FOUND: 用户钱包账户不存在 (userId=${params.userId})`,
          );
        }
      }

      if (needQuotaLock) {
        const quotas = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT \`id\` FROM \`workspacequota\` WHERE \`workspaceId\` = ${params.workspaceId} FOR UPDATE
        `;
        if (quotas.length === 0) {
          throw new RefundAccountNotFoundError(
            `REFUND_ACCOUNT_NOT_FOUND: 空间配额账户不存在 (workspaceId=${params.workspaceId})`,
          );
        }
      }

      if (needMemberLock) {
        const members = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT \`id\` FROM \`workspacemember\` WHERE \`userId\` = ${params.userId} AND \`workspaceId\` = ${params.workspaceId} FOR UPDATE
        `;
        if (members.length === 0) {
          throw new RefundAccountNotFoundError(
            `REFUND_ACCOUNT_NOT_FOUND: 企业成员账户不存在 (userId=${params.userId}, workspaceId=${params.workspaceId})`,
          );
        }
      }

      // 4. 测试注入点：必须发生在事务内部，证明事务真实回滚和后续独立事务重新开启
      if (testState && testState.injectedCount < testState.maxInjections) {
        testState.injectedCount += 1;
        throw new SimulatedP2034Error();
      }

      for (const plan of plans) {
        const idempotencyKey = plan.idempotencyKey;
        // 该来源分桶已退款则跳过（重复进入不重复增加余额）
        const exist = await tx.pointledger.findFirst({ where: { idempotencyKey } });
        if (exist) continue;

        if (plan.kind === "MEMBER") {
          await tx.workspacemember.updateMany({
            where: { userId: params.userId, workspaceId: params.workspaceId },
            data: { tokenBalance: { increment: BigInt(plan.points) } },
          });
          const mAfter = await tx.workspacemember.findUnique({
            where: { userId_workspaceId: { userId: params.userId, workspaceId: params.workspaceId } },
            select: { tokenBalance: true },
          });
          await tx.pointledger.create({
            data: {
              id: crypto.randomUUID(),
              direction: "IN",
              type: "REFUND",
              scope: "WORKSPACE",
              userId: params.userId,
              userEmail: params.userEmail ?? null,
              workspaceId: params.workspaceId,
              workspaceType: params.workspaceType ?? null,
              workspaceName: params.workspaceName ?? null,
              operatorId: params.operatorId ?? null,
              points: BigInt(plan.points),
              balanceAfter: BigInt(mAfter ? Number(mAfter.tokenBalance) : 0),
              componentId: params.componentId ?? null,
              componentName: params.componentName ?? null,
              taskId: params.taskId ?? null,
              title: params.componentName ? `算力退回：${params.componentName}` : "算力退回",
              remark: "真实模型失败原路退款：恢复企业成员独立余额",
              idempotencyKey,
            },
          });
          refunded += plan.points;
          newlyProcessed += 1;
          continue;
        }

        // 钱包 / 个人赠送 / 共享池：恢复 pointgrant 剩余 + 对应账户余额
        const grant = plan.grantId
          ? await tx.pointgrant.findUnique({ where: { id: plan.grantId } })
          : null;
        const expiredOrMissing = plan.expiredFallback || !grant || grant.status === "EXPIRED";

        if (!expiredOrMissing && grant) {
          await tx.pointgrant.update({
            where: { id: grant.id },
            data: {
              remaining: { increment: BigInt(plan.points) },
              status: Number(grant.remaining) + plan.points > 0 ? "ACTIVE" : "EXHAUSTED",
              updatedAt: now,
            },
          });
        } else {
          // 原分桶已过期/缺失：新建同 scope 兜底分桶，不改变余额归属
          await tx.pointgrant.create({
            data: {
              id: crypto.randomUUID(),
              scope: plan.kind,
              userId: plan.kind === "WALLET" ? params.userId : null,
              workspaceId: plan.kind === "WALLET" ? null : params.workspaceId,
              points: BigInt(plan.points),
              remaining: BigInt(plan.points),
              sourceType: "REFUND",
              sourceId: `REFUND:${params.taskId}:${idempotencyKey.split(":").pop()}`,
              status: "ACTIVE",
              operatorId: params.operatorId ?? null,
              title: "原分桶已过期·兜底退回",
              remark: "原分桶已过期，已退回至对应账户兜底分桶（不改变余额归属）",
              updatedAt: now,
            },
          });
        }

        let balanceAfter = 0;
        if (plan.kind === "WALLET") {
          const w = await tx.userwallet.update({
            where: { userId: params.userId },
            data: { balance: { increment: BigInt(plan.points) }, updatedAt: now },
          });
          balanceAfter = Number(w.balance);
        } else {
          // 严禁用 upsert 静默创建配额掩盖账务缺失；已在事务起始处做排他锁强校验，此处安全更新
          const q = await tx.workspacequota.update({
            where: { workspaceId: params.workspaceId },
            data: { tokenBalance: { increment: BigInt(plan.points) }, updatedAt: now },
          });
          balanceAfter = Number(q.tokenBalance);
        }

        await tx.pointledger.create({
          data: {
            id: crypto.randomUUID(),
            direction: "IN",
            type: "REFUND",
            scope: plan.kind,
            userId: params.userId,
            userEmail: params.userEmail ?? null,
            workspaceId: plan.kind === "WALLET" ? null : params.workspaceId,
            workspaceType: params.workspaceType ?? null,
            workspaceName: params.workspaceName ?? null,
            operatorId: params.operatorId ?? null,
            points: BigInt(plan.points),
            balanceAfter: BigInt(balanceAfter),
            componentId: params.componentId ?? null,
            componentName: params.componentName ?? null,
            taskId: params.taskId ?? null,
            grantId: grant && !expiredOrMissing ? grant.id : null,
            title: params.componentName ? `算力退回：${params.componentName}` : "算力退回",
            remark: expiredOrMissing
              ? "原分桶已过期，已退回至对应账户兜底分桶"
              : "真实模型失败原路退回",
            idempotencyKey,
          },
        });
        refunded += plan.points;
        newlyProcessed += 1;
      }

      // 回滚本次增加的成员月度已用额度（幂等，独立标记；保证不重复、不转负）
      if (cr.monthlyTokenUsedIncremented > 0) {
        const monthlyKey = `${REFUND_MODEL_FAILURE_PREFIX}:${params.taskId}:MONTHLY`;
        const monthlyMarker = await tx.pointledger.findFirst({ where: { idempotencyKey: monthlyKey } });
        // 仅当本次事务确实新处理了来源退款，或本次为无限额度（无来源退款但需回滚月度）时才回滚；
        // 若所有来源退款流水均已存在，则完全跳过月度回滚，避免重复回滚。
        const needMonthly = newlyProcessed > 0 || cr.unlimited;
        if (!monthlyMarker && needMonthly) {
          const m = await tx.workspacemember.findUnique({
            where: { userId_workspaceId: { userId: params.userId, workspaceId: params.workspaceId } },
            select: { monthlyTokenUsed: true },
          });
          const currentUsed = Number(m?.monthlyTokenUsed ?? 0);
          const nextUsed = Math.max(0, currentUsed - cr.monthlyTokenUsedIncremented);
          await tx.workspacemember.updateMany({
            where: { userId: params.userId, workspaceId: params.workspaceId },
            data: { monthlyTokenUsed: { set: BigInt(nextUsed) } },
          });
          await tx.pointledger.create({
            data: {
              id: crypto.randomUUID(),
              direction: "IN",
              type: "REFUND",
              scope: "WORKSPACE",
              userId: params.userId,
              userEmail: params.userEmail ?? null,
              workspaceId: params.workspaceId,
              workspaceType: params.workspaceType ?? null,
              workspaceName: params.workspaceName ?? null,
              operatorId: params.operatorId ?? null,
              points: BigInt(0),
              balanceAfter: BigInt(nextUsed),
              componentId: params.componentId ?? null,
              componentName: params.componentName ?? null,
              taskId: params.taskId ?? null,
              title: "月度已用额度回滚",
              remark: cr.unlimited
                ? "无限额度无退款点，仅回滚月度已用额度"
                : "任务失败：月度已用额度原路回滚",
              idempotencyKey: monthlyKey,
            },
          });
        }
      }

      return { refunded };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      timeout: 15_000,
    },
  );
}

export async function refundConsumedPoints(params: {
  consumeResult: ConsumeResult;
  userId: string;
  workspaceId: string;
  taskId?: string | null;
  componentId?: string | null;
  componentName?: string | null;
  operatorId?: string | null;
  workspaceType?: string | null;
  workspaceName?: string | null;
  userEmail?: string | null;
  _testSimulateP2034Times?: number;
}): Promise<{ refunded: number }> {
  const cr = params.consumeResult;
  if (cr.skipped) return { refunded: 0 };
  if (!cr.unlimited && cr.consumed <= 0 && (!cr.monthlyTokenUsedIncremented || cr.monthlyTokenUsedIncremented <= 0)) {
    return { refunded: 0 };
  }
  if (!params.taskId) throw new Error("refundConsumedPoints 需要 taskId 以保证幂等");

  let attempt = 0;
  const testState = {
    injectedCount: 0,
    maxInjections: params._testSimulateP2034Times ?? 0,
  };

  while (true) {
    try {
      return await executeRefundTx(params, testState);
    } catch (err) {
      if (isRetryableP2034(err) && attempt < MAX_REFUND_RETRIES) {
        attempt += 1;
        await backoffForRetry(attempt);
        continue;
      }
      throw err;
    }
  }
}

/**
 * 退还算力点（任务失败/冲正）：退回用户钱包，永不过期
 * @deprecated 真实模型执行统一改用 refundConsumedPoints 做原路退款，避免一律退回钱包
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

/** 转移方向：共享池 → 成员独立余额 / 成员独立余额 → 共享池（回收） */
export type TransferDirection = "POOL_TO_MEMBER" | "MEMBER_TO_POOL";

export interface TransferPointsParams {
  workspaceId: string;
  /** 成员用户 ID */
  userId: string;
  /** 转移点数（正数） */
  points: number;
  direction: TransferDirection;
  operatorId: string;
  reason: string;
  workspaceType?: string | null;
  workspaceName?: string | null;
  userEmail?: string | null;
  idempotencyKey?: string | null;
}

export interface TransferPointsResult {
  ledgerIds: string[];
  /** 转移后共享池余额 */
  poolBalanceAfter: number;
  /** 转移后成员独立余额 */
  memberBalanceAfter: number;
}

/**
 * 空间共享池 ↔ 成员独立余额 的双向转移（单一事务，两腿同时成功或同时失败）。
 *
 * 账务口径：
 * - 共享池侧必须走 pointgrant 分桶扣减 / 建桶入账，禁止直改 workspacequota.tokenBalance
 *   （直改会导致「分桶剩余合计」与「余额」脱钩，后续所有对账都被污染）；
 * - 成员侧按既有语义更新 workspacemember.tokenBalance（成员余额非分桶制，与 deductPointsInTx
 *   的 ENTERPRISE/MEMBER 分支口径一致）；
 * - 两腿均写 pointledger（OUT/IN 各一条以上），并共享同一幂等键前缀。
 */
export async function transferPoints(params: TransferPointsParams): Promise<TransferPointsResult> {
  const amount = Math.floor(Number(params.points) || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("转移点数必须为正整数");
  }
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const ledgerIds: string[] = [];
    let poolBalanceAfter = 0;
    let memberBalanceAfter = 0;

    // 成员记录与目标空间配额必须存在（缺失即显式报错，绝不静默创建）
    const member = await tx.workspacemember.findUnique({
      where: { userId_workspaceId: { userId: params.userId, workspaceId: params.workspaceId } },
    });
    if (!member) throw new Error("成员不存在于该空间，无法转移算力点");

    if (params.direction === "POOL_TO_MEMBER") {
      // —— 腿 1：共享池按「先到期优先」逐桶扣减 ——
      const buckets = await tx.pointgrant.findMany({
        where: {
          status: "ACTIVE",
          remaining: { gt: 0 },
          scope: "WORKSPACE",
          workspaceId: params.workspaceId,
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
      if (available < amount) throw new InsufficientPointsError(available, amount);

      let left = amount;
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
        const q = await tx.workspacequota.update({
          where: { workspaceId: params.workspaceId },
          data: { tokenBalance: { decrement: BigInt(take) }, updatedAt: now },
        });
        poolBalanceAfter = Number(q.tokenBalance);
        const outLedger = await tx.pointledger.create({
          data: {
            id: crypto.randomUUID(),
            direction: "OUT",
            type: "MANUAL_ADJUST",
            scope: "WORKSPACE",
            userId: params.userId,
            userEmail: params.userEmail ?? null,
            workspaceId: params.workspaceId,
            workspaceType: params.workspaceType ?? null,
            workspaceName: params.workspaceName ?? null,
            operatorId: params.operatorId,
            points: BigInt(take),
            balanceAfter: BigInt(poolBalanceAfter),
            grantId: bucket.id,
            paymentMethod: "MANUAL",
            title: "管理员分配算力（共享池出账）",
            remark: params.reason,
            idempotencyKey: params.idempotencyKey ? `${params.idempotencyKey}#POOL#${index}` : null,
          },
        });
        ledgerIds.push(outLedger.id);
        left -= take;
      }

      // —— 腿 2：成员独立余额入账 ——
      const updatedMember = await tx.workspacemember.update({
        where: { id: member.id },
        data: { tokenBalance: { increment: BigInt(amount) }, updatedAt: now },
      });
      memberBalanceAfter = Number(updatedMember.tokenBalance);
      const inLedger = await tx.pointledger.create({
        data: {
          id: crypto.randomUUID(),
          direction: "IN",
          type: "MANUAL_ADJUST",
          scope: "WORKSPACE",
          userId: params.userId,
          userEmail: params.userEmail ?? null,
          workspaceId: params.workspaceId,
          workspaceType: params.workspaceType ?? null,
          workspaceName: params.workspaceName ?? null,
          operatorId: params.operatorId,
          points: BigInt(amount),
          balanceAfter: BigInt(memberBalanceAfter),
          paymentMethod: "MANUAL",
          title: "管理员分配算力（成员入账）",
          remark: params.reason,
          idempotencyKey: params.idempotencyKey ? `${params.idempotencyKey}#MEMBER` : null,
        },
      });
      ledgerIds.push(inLedger.id);
      return { ledgerIds, poolBalanceAfter, memberBalanceAfter };
    }

    // —— MEMBER_TO_POOL：成员独立余额出账，共享池建桶入账 ——
    const memberBalance = Number(member.tokenBalance);
    if (memberBalance < amount) throw new InsufficientPointsError(memberBalance, amount);
    const updatedMember = await tx.workspacemember.update({
      where: { id: member.id },
      data: { tokenBalance: { decrement: BigInt(amount) }, updatedAt: now },
    });
    memberBalanceAfter = Number(updatedMember.tokenBalance);
    const outLedger = await tx.pointledger.create({
      data: {
        id: crypto.randomUUID(),
        direction: "OUT",
        type: "MANUAL_ADJUST",
        scope: "WORKSPACE",
        userId: params.userId,
        userEmail: params.userEmail ?? null,
        workspaceId: params.workspaceId,
        workspaceType: params.workspaceType ?? null,
        workspaceName: params.workspaceName ?? null,
        operatorId: params.operatorId,
        points: BigInt(amount),
        balanceAfter: BigInt(memberBalanceAfter),
        paymentMethod: "MANUAL",
        title: "管理员回收算力（成员出账）",
        remark: params.reason,
        idempotencyKey: params.idempotencyKey ? `${params.idempotencyKey}#MEMBER` : null,
      },
    });
    ledgerIds.push(outLedger.id);

    // 回收进共享池：必须新建分桶，保证池余额与分桶合计一致
    await tx.pointgrant.create({
      data: {
        id: crypto.randomUUID(),
        scope: "WORKSPACE",
        userId: null,
        workspaceId: params.workspaceId,
        points: BigInt(amount),
        remaining: BigInt(amount),
        sourceType: "MANUAL",
        sourceId: params.idempotencyKey ?? null,
        expiresAt: null,
        status: "ACTIVE",
        operatorId: params.operatorId,
        title: "管理员回收成员算力至共享池",
        remark: params.reason,
        createdAt: now,
        updatedAt: now,
      },
    });
    const q = await tx.workspacequota.update({
      where: { workspaceId: params.workspaceId },
      data: { tokenBalance: { increment: BigInt(amount) }, updatedAt: now },
    });
    poolBalanceAfter = Number(q.tokenBalance);
    const inLedger = await tx.pointledger.create({
      data: {
        id: crypto.randomUUID(),
        direction: "IN",
        type: "MANUAL_ADJUST",
        scope: "WORKSPACE",
        userId: params.userId,
        userEmail: params.userEmail ?? null,
        workspaceId: params.workspaceId,
        workspaceType: params.workspaceType ?? null,
        workspaceName: params.workspaceName ?? null,
        operatorId: params.operatorId,
        points: BigInt(amount),
        balanceAfter: BigInt(poolBalanceAfter),
        paymentMethod: "MANUAL",
        title: "管理员回收算力（共享池入账）",
        remark: params.reason,
        idempotencyKey: params.idempotencyKey ? `${params.idempotencyKey}#POOL` : null,
      },
    });
    ledgerIds.push(inLedger.id);
    return { ledgerIds, poolBalanceAfter, memberBalanceAfter };
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
  opts?: { memberTokenBalance?: number | null },
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

  // 普通成员视图：可用余额为其在本空间的独立余额，不并入共享池
  if (typeof opts?.memberTokenBalance === "number") {
    workspaceBalance = opts.memberTokenBalance;
    unlimited = false;
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
    available: unlimited
      ? null
      : typeof opts?.memberTokenBalance === "number"
      ? workspaceBalance
      : walletBalance + workspaceBalance,
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
