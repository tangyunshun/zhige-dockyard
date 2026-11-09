import { prisma } from "@/lib/prisma";

/**
 * 空间文件存储配额（真实记账）。
 *
 * 统计口径：知识库/资料上传的真实物理文件（document.fileSize），
 * 物理载体为服务器本地磁盘 uploads/assets/{workspaceId}/。
 * 配额数据落在 workspacequota.storageUsed / storageLimit（字节），
 * 上传时校验并累加、删除时扣减，保证展示值与真实文件占用一致。
 */

export class StorageQuotaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageQuotaError";
  }
}

/**
 * 校验空间剩余存储是否足够容纳 incomingBytes 的新文件。
 * - 空间无配额记录 / 上限为 0 或负数（-1 约定为不限）时不限制。
 * - 超限时抛出 StorageQuotaError，由调用方转成 4xx 响应。
 */
export async function assertStorageQuota(
  workspaceId: string,
  incomingBytes: number,
): Promise<void> {
  if (!workspaceId || !Number.isFinite(incomingBytes) || incomingBytes <= 0) return;
  const quota = await prisma.workspacequota.findUnique({
    where: { workspaceId },
    select: { storageUsed: true, storageLimit: true },
  });
  if (!quota) return;
  const limit = Number(quota.storageLimit);
  if (limit <= 0) return; // 0 / -1 视为不限制
  const used = Number(quota.storageUsed);
  if (used + incomingBytes > limit) {
    const mb = (incomingBytes / 1048576).toFixed(2);
    const usedGb = (used / 1073741824).toFixed(2);
    const limitGb = (limit / 1073741824).toFixed(2);
    throw new StorageQuotaError(
      `空间文件存储空间不足：已用 ${usedGb}GB / 上限 ${limitGb}GB，无法再上传 ${mb}MB 的文件。请先清理不需要的资料，或申请提升存储额度。`,
    );
  }
}

/** 上传入账：累加空间存储用量（原子 increment，配额行不存在时静默忽略，不阻断业务） */
export async function addStorageUsed(workspaceId: string, deltaBytes: number): Promise<void> {
  const delta = Math.round(deltaBytes);
  if (!workspaceId || delta <= 0) return;
  try {
    await prisma.workspacequota.update({
      where: { workspaceId },
      data: { storageUsed: { increment: BigInt(delta) } },
    });
  } catch {
    // 配额行不存在等场景不阻断主业务
  }
}

/** 删除出账：扣减空间存储用量，并钳制不为负（防历史脏数据导致负值展示） */
export async function subtractStorageUsed(
  workspaceId: string,
  deltaBytes: number,
): Promise<void> {
  const delta = Math.round(deltaBytes);
  if (!workspaceId || delta <= 0) return;
  try {
    const quota = await prisma.workspacequota.findUnique({
      where: { workspaceId },
      select: { storageUsed: true },
    });
    if (!quota) return;
    const next = Math.max(0, Number(quota.storageUsed) - delta);
    await prisma.workspacequota.update({
      where: { workspaceId },
      data: { storageUsed: BigInt(next) },
    });
  } catch {
    // 记账失败不阻断删除主流程
  }
}
