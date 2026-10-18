import { prisma } from "@/lib/prisma";
import { MEMBERSHIP_CONFIGS, type MembershipLevel } from "@/lib/membership";
import { WORKSPACE_PLANS, normalizePlan } from "@/constants/workspace-plans";

/**
 * 能力维度：会员等级维度 与 空间套餐维度 中，"能力类"字段就高不就低取最大值。
 * 数据库 membershiplevel / workspaceplan 是权威数据源；本解析器在库不可用时回落常量。
 */
export interface CapabilityDimensions {
  /** 并发任务数上限（同一账号/空间同时运行）；-1 = 不限制 */
  maxConcurrency: number;
  /** 单次上传文件大小上限（字节）；-1 = 不限制 */
  maxSingleFileBytes: number;
  /** 可分配系统模型数量上限；-1 = 不限制 */
  maxModelAllocations: number;
  /** 自建模型（BYO）数量上限；-1 = 不限制 */
  maxByoModels: number;
}

const UNLIMITED = -1;

/** 合并单个维度：0 表示该来源未设置（忽略）；-1 为不限制；其它取较大值（就高不就低） */
function mergeOne(a: number, b: number): number {
  if (a === UNLIMITED || b === UNLIMITED) return UNLIMITED;
  if (a <= 0) return b <= 0 ? 0 : b;
  if (b <= 0) return a;
  return Math.max(a, b);
}

async function getMembershipDimension(level: string): Promise<CapabilityDimensions> {
  try {
    const row = await prisma.membershiplevel.findUnique({ where: { name: level } });
    if (row) {
      return {
        maxConcurrency: row.maxConcurrency ?? 1,
        maxSingleFileBytes: Number(row.maxSingleFileBytes ?? 0),
        maxModelAllocations: row.maxModelAllocations ?? 0,
        maxByoModels: row.maxByoModels ?? 0,
      };
    }
  } catch {
    /* 库不可用时回退常量 */
  }
  const cfg = MEMBERSHIP_CONFIGS[level as MembershipLevel] || MEMBERSHIP_CONFIGS.FREE;
  return {
    maxConcurrency: cfg.maxConcurrency,
    maxSingleFileBytes: cfg.maxSingleFileBytes,
    maxModelAllocations: cfg.maxModelAllocations,
    maxByoModels: cfg.maxByoModels,
  };
}

async function getPlanDimension(planKey: string): Promise<CapabilityDimensions> {
  const key = normalizePlan(planKey);
  try {
    const row = await prisma.workspaceplan.findUnique({ where: { key } });
    if (row) {
      return {
        maxConcurrency: row.maxConcurrency ?? 0,
        maxSingleFileBytes: Number(row.maxSingleFileBytes ?? 0),
        maxModelAllocations: row.maxModelAllocations ?? 0,
        maxByoModels: row.maxByoModels ?? 0,
      };
    }
  } catch {
    /* 回退常量 */
  }
  const cfg = WORKSPACE_PLANS[key];
  return {
    maxConcurrency: cfg.maxConcurrency,
    maxSingleFileBytes: cfg.maxSingleFileBytes,
    maxModelAllocations: cfg.maxModelAllocations,
    maxByoModels: cfg.maxByoModels,
  };
}

/**
 * 解析"生效能力上限"：
 * - 个人空间（PERSONAL）：仅会员维度生效（无套餐上限）。
 * - 企业空间（ENTERPRISE）：会员维度 与 套餐维度 取较高值（就高不就低）。
 */
export async function resolveEffectiveCapability(
  membershipLevel: string,
  planKey: string,
  workspaceType: string,
): Promise<CapabilityDimensions> {
  const m = await getMembershipDimension(membershipLevel);
  if (workspaceType === "PERSONAL") return m;
  const p = await getPlanDimension(planKey);
  return {
    maxConcurrency:
      p.maxConcurrency === UNLIMITED
        ? UNLIMITED
        : Math.max(m.maxConcurrency, Math.max(p.maxConcurrency, 0)),
    maxSingleFileBytes: mergeOne(m.maxSingleFileBytes, p.maxSingleFileBytes),
    maxModelAllocations: mergeOne(m.maxModelAllocations, p.maxModelAllocations),
    maxByoModels: mergeOne(m.maxByoModels, p.maxByoModels),
  };
}
