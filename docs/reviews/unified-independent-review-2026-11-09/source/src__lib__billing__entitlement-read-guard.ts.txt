/**
 * [P07 / R1] CF-F04 / CF-F09 只读不变量守卫。
 *
 * 批次7 §7.1–7.3 与 CF-F04（FREE 额度读时覆写）、CF-F09（空间/quota 双关联）的核现状结论：
 *   - 查询（读）不能改权益；先只读核清映射，历史关系不明不自动重绑/补额度。
 *   - 现有注册/空间赠送资格必须有稳定来源/活动认领和批准预算；删除重建不能重置资格；
 *     不新增赠送政策。
 *
 * 本模块是纯只读校验，不执行任何写、不自动重绑、不补额度；发现异常只返回「需人工对账/复核」标记。
 */

export interface QuotaMapping {
  spaceId: string;
  quotaId: string;
}

export interface QuotaDoubleBindingResult {
  /** 是否存在空间↔quota 双关联（一个空间多个 quota，或一个 quota 多个空间） */
  doubled: boolean;
  /** 需要人工复核的处理，绝不自动重绑/补额度 */
  conflicts: string[];
  /** 稳定的空间→配额认领（1:1 正常映射） */
  resolved: Record<string, string>;
}

/**
 * CF-F09：只读核清空间↔quota 映射。发现双关联时只标记人工复核，返回 resolved 仅含 1:1 正常项，
 * 绝不自动重绑或补额度（历史关系不明时保持原状，交由人工决策）。
 */
export function classifyQuotaDoubleBinding(mappings: QuotaMapping[]): QuotaDoubleBindingResult {
  const conflicts: string[] = [];
  const spaceToQuotas = new Map<string, string[]>();
  const quotaToSpaces = new Map<string, string[]>();
  for (const m of mappings) {
    if (!spaceToQuotas.has(m.spaceId)) spaceToQuotas.set(m.spaceId, []);
    spaceToQuotas.get(m.spaceId)!.push(m.quotaId);
    if (!quotaToSpaces.has(m.quotaId)) quotaToSpaces.set(m.quotaId, []);
    quotaToSpaces.get(m.quotaId)!.push(m.spaceId);
  }
  const resolved: Record<string, string> = {};
  for (const [spaceId, quotas] of spaceToQuotas) {
    if (quotas.length > 1) {
      conflicts.push(`空间 ${spaceId} 关联了多个 quota（${quotas.join(",")}），需人工复核，不自动重绑`);
    }
  }
  for (const [quotaId, spaces] of quotaToSpaces) {
    if (spaces.length > 1) {
      conflicts.push(`quota ${quotaId} 关联了多个空间（${spaces.join(",")}），需人工复核，不补额度`);
    }
  }
  // 仅把 1:1 正常映射纳入 resolved；双关联项不擅自认领
  for (const [spaceId, quotas] of spaceToQuotas) {
    if (quotas.length === 1) {
      const quotaId = quotas[0];
      const sts = quotaToSpaces.get(quotaId);
      if (sts && sts.length === 1) resolved[spaceId] = quotaId;
    }
  }
  return { doubled: conflicts.length > 0, conflicts, resolved };
}

export interface ReadOperation {
  kind: string;
  /** 该读操作是否在执行过程中授予了权益/额度（CF-F04 红线：读时覆写/补额度） */
  mutatesEntitlement: boolean;
}

/**
 * CF-F04：读操作不得改权益。返回是否违反红线（mutatesEntitlement=true 即违反）。
 * 仅用于接线层的运行时断言与测试，不自动修正。
 */
export function assertReadDoesNotGrant(op: ReadOperation): { safe: boolean; reason?: string } {
  if (op.mutatesEntitlement) {
    return { safe: false, reason: `读操作 ${op.kind} 在执行中修改了权益/额度（CF-F04 红线：查询不能改权益）` };
  }
  return { safe: true };
}
