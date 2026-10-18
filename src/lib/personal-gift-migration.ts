/**
 * 个人当月赠送额度（PERSONAL_GIFT）迁移到企业共享池（WORKSPACE）。
 *
 * 触发场景：个人空间升级为企业空间（新建企业空间）时，把原个人空间里
 * 当月有效、尚未用完的注册赠送额度，转移到新建企业空间的共享池里，
 * 避免升级后这部分额度随个人空间保留/删除而浪费。
 *
 * 语义保留：迁移后保留原桶的最早到期时间（仍是当月有效，月底清零），
 * 不改变额度性质，只是把承载它的账户从「个人赠送」换到「企业共享池」。
 *
 * 幂等：以 MIGRATE_PGIFT:<userId>:<from>-><to> 为唯一键。
 *  - 企业池已存在该键的入账流水 → 整体跳过；
 *  - 每条出账流水也带唯一键，重复执行不会重复记账。
 */

import { prisma } from "@/lib/prisma";
import { grantPoints } from "@/lib/credit-service";

export interface MigrateGiftParams {
  userId: string;
  /** 来源：被升级/删除的个人空间 ID */
  fromWorkspaceId: string;
  /** 目标：新建的企业空间 ID */
  toWorkspaceId: string;
}

export interface MigrateGiftResult {
  migrated: number;
  skipped: boolean;
}

export async function migratePersonalGiftToEnterprisePool(
  params: MigrateGiftParams
): Promise<MigrateGiftResult> {
  const key = `MIGRATE_PGIFT:${params.userId}:${params.fromWorkspaceId}->${params.toWorkspaceId}`;

  // 幂等：企业共享池已有该 key 的入账流水则整体跳过
  const already = await prisma.pointledger.findFirst({
    where: {
      idempotencyKey: { startsWith: `${key}#` },
      scope: "WORKSPACE",
      direction: "IN",
    },
  });
  if (already) return { migrated: 0, skipped: true };

  const now = new Date();
  const grants = await prisma.pointgrant.findMany({
    where: {
      scope: "PERSONAL_GIFT",
      userId: params.userId,
      workspaceId: params.fromWorkspaceId,
      status: "ACTIVE",
      remaining: { gt: 0 },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: { expiresAt: "asc" },
  });

  const total = grants.reduce((s, g) => s + Number(g.remaining), 0);
  if (total <= 0) return { migrated: 0, skipped: false };

  // OUT：把原个人赠送桶标记已迁移（remaining 归零），并逐条写出账流水（带唯一键，可重复执行）
  for (const g of grants) {
    const remain = Number(g.remaining);
    await prisma.pointgrant.update({
      where: { id: g.id },
      data: { remaining: BigInt(0), status: "EXHAUSTED", updatedAt: now },
    });
    const outKey = `${key}:OUT:${g.id}`;
    const existingOut = await prisma.pointledger.findFirst({ where: { idempotencyKey: outKey } });
    if (!existingOut) {
      await prisma.pointledger.create({
        data: {
          id: crypto.randomUUID(),
          direction: "OUT",
          type: "MANUAL_ADJUST",
          scope: "PERSONAL_GIFT",
          userId: params.userId,
          workspaceId: params.fromWorkspaceId,
          workspaceType: "PERSONAL",
          operatorId: params.userId,
          points: BigInt(remain),
          balanceAfter: BigInt(0),
          grantId: g.id,
          title: "个人赠送额度迁移至企业空间",
          remark: `迁移至企业空间 ${params.toWorkspaceId}`,
          idempotencyKey: outKey,
        },
      });
    }
  }

  // IN：用标准发放入口把等额额度注入企业共享池（保留最早到期时间）
  const expDates = grants.map((g) => g.expiresAt).filter((x): x is Date => !!x);
  const earliestExp = expDates.length
    ? expDates.sort((a, b) => a.getTime() - b.getTime())[0]
    : null;

  await grantPoints({
    scope: "WORKSPACE",
    workspaceId: params.toWorkspaceId,
    userId: params.userId,
    points: total,
    sourceType: "GIFT_REGISTER",
    type: "GIFT_REGISTER",
    idempotencyKey: key,
    title: "个人赠送额度迁移至企业空间",
    remark: `迁移自个人空间 ${params.fromWorkspaceId}`,
    expiresAt: earliestExp,
  });

  return { migrated: total, skipped: false };
}
