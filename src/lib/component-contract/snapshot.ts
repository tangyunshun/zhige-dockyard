/**
 * 组件合同快照生成器 (深拷贝与不可变冻结)
 */

import { randomUUID } from "crypto";
import { ComponentContractError } from "./errors";
import { ComponentContract, ComponentContractSnapshot } from "./types";
import { validateComponentContract } from "./validators";

/**
 * 递归深冻结对象，确保快照完全不可变
 */
function deepFreeze<T>(obj: T): Readonly<T> {
  if (obj === null || obj === undefined || typeof obj !== "object") {
    return obj;
  }

  // 递归冻结属性
  for (const key of Object.keys(obj)) {
    const val = (obj as Record<string, unknown>)[key];
    if (val !== null && typeof val === "object" && !Object.isFrozen(val)) {
      deepFreeze(val);
    }
  }

  return Object.freeze(obj);
}

/**
 * 构建不可变已发布合同快照
 *
 * 核心保障：
 * 1. 必须先通过 validateComponentContract 校验；
 * 2. 状态必须为 PUBLISHED（DRAFT 或 ARCHIVED 绝不允许生成可执行快照）；
 * 3. 严格执行深拷贝（利用 structuredClone，不受原对象修改影响）；
 * 4. 递归 deepFreeze 冻结快照，任何写操作在严格模式下抛错。
 */
export function buildComponentContractSnapshot(
  contract: ComponentContract
): ComponentContractSnapshot {
  // 1. 校验完整合同
  const validated = validateComponentContract(contract);

  // 2. 状态检查
  if (validated.lifecycle !== "PUBLISHED") {
    throw new ComponentContractError(
      "CONTRACT_LIFECYCLE_INVALID",
      `只有处于 [PUBLISHED] 状态的合同才允许生成不可变快照，当前状态: [${validated.lifecycle}]！`
    );
  }

  // 3. 严格深拷贝
  const clonedContract: ComponentContract =
    typeof structuredClone === "function"
      ? structuredClone(validated)
      : JSON.parse(JSON.stringify(validated));

  const snapshot: ComponentContractSnapshot = {
    snapshotId: `snapshot_${validated.componentId}_v${validated.contractVersion}_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
    snapshotCreatedAt: new Date().toISOString(),
    contract: deepFreeze(clonedContract),
  };

  return deepFreeze(snapshot);
}
