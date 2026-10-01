import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * 模型注册表「引用完整性」串行边界。
 *
 * 用途：串行化三个互相冲突的写操作，消除「检查后写入」（TOCTOU）竞态：
 *   1. 删除模型部署（model-deployments/[id] DELETE）——需确认没有任何空间策略引用该部署；
 *   2. 写入空间模型策略（workspaces/[workspaceId]/model-policy PUT）——需确认引用的部署真实存在；
 *   3. 删除供应商（model-providers/[id] DELETE）——需确认其下已无模型部署。
 *
 * 为什么需要：workspace_model_policy.allowedDeploymentIds 是 JSON 数组，无法建立数据库外键，
 * 仅靠应用层「先查再写」在并发下会漏。
 *
 * ── 实现要点（关键）────────────────────────────────────────────────
 * 使用**锁行 + SELECT ... FOR UPDATE**：
 *   - InnoDB 行锁由数据库持有，直到事务 COMMIT / ROLLBACK 才自动释放；
 *   - 因此保护边界**必然覆盖到提交完成**，不存在「提交前提前释放」的窗口。
 *
 * ⚠ 不得改用 MySQL 命名锁 GET_LOCK/RELEASE_LOCK：Prisma interactive transaction 的
 *   回调 finally 会在 COMMIT **之前**执行，等于在提交前就放锁，边界失效（本轮已修复该缺陷）。
 *   同理，也不允许在回调内手工释放锁后再由 Prisma 提交。
 *
 * defaultDeploymentId / providerId 另有数据库外键（ON DELETE/UPDATE RESTRICT）作为第二层兜底。
 */
export const MODEL_REGISTRY_REF_LOCK_ID = "MODEL_REGISTRY_REFS";

/** 锁等待超时（并发冲突长时间未释放时显式失败，不静默放行） */
export class ModelRegistryLockTimeoutError extends Error {
  constructor(message = "模型注册表当前有其他写操作正在进行，请稍后重试。") {
    super(message);
    this.name = "ModelRegistryLockTimeoutError";
  }
}

/** 事务上限（毫秒）：包含等待锁 + 业务写入，超时即失败并提示重试 */
const TRANSACTION_TIMEOUT_MS = 15_000;
const TRANSACTION_MAX_WAIT_MS = 20_000;

/**
 * 在同一个数据库事务（同一连接）内获取串行锁执行 fn。
 *
 * 锁在事务提交后才由数据库释放，因此 fn 内的「检查 + 写入」与提交是原子的保护区间。
 */
export async function withModelRegistryLock<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  try {
    return await prisma.$transaction(
      async (tx) => {
        // 获取锁行：FOR UPDATE 的行锁持续到事务结束（提交/回滚）自动释放。
        const rows = await tx.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`SELECT \`id\` FROM \`registrylock\` WHERE \`id\` = ${MODEL_REGISTRY_REF_LOCK_ID} FOR UPDATE`,
        );
        // 锁行必须存在：缺失即说明锁表未初始化，此时 FOR UPDATE 无法提供串行保护 → 明确拒绝
        if (rows.length !== 1) {
          throw new ModelRegistryLockTimeoutError(
            "模型注册表锁行缺失（registrylock 未初始化），已拒绝执行以避免丢失串行保护。",
          );
        }
        return await fn(tx);
      },
      {
        // ReadCommitted：拿到锁之后必须读到**最新已提交**数据（避免 REPEATABLE READ 陈旧快照
        // 导致「被并发删除的部署」仍被判定为存在而写入无效 JSON 引用）。
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        timeout: TRANSACTION_TIMEOUT_MS,
        maxWait: TRANSACTION_MAX_WAIT_MS,
      },
    );
  } catch (e) {
    if (e instanceof ModelRegistryLockTimeoutError) throw e;
    const code = (e as { code?: string })?.code;
    // P2028 事务超时 / P2034 死锁或写冲突 → 统一作为「并发冲突，请重试」返回
    if (code === "P2028" || code === "P2034") {
      throw new ModelRegistryLockTimeoutError();
    }
    throw e;
  }
}
