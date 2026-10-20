import { prisma } from "@/lib/prisma";

/**
 * 归档 / 停用空间只读守卫错误
 * - ARCHIVED：升级后转为只读归档（数据保留，不可再写入）
 * - DISABLED：平台已停用
 */
export class WorkspaceReadOnlyError extends Error {
  status: string;
  constructor(status: string) {
    super(
      status === "ARCHIVED"
        ? "该空间已归档为只读，不可写入或修改"
        : "该空间已停用，暂不可操作",
    );
    this.name = "WorkspaceReadOnlyError";
    this.status = status;
  }
}

/**
 * 写操作前的只读守卫：若空间为 ARCHIVED（只读归档）或 DISABLED（已停用）则抛出。
 * 仅用于「写操作」入口；读操作（如查看归档空间内容）不应调用，否则会误拦。
 * workspaceId 为空（例如纯钱包扣减）时直接放行，不影响与个人空间无关的扣减。
 *
 * 注：本文件刻意不引入 fs/path 等 Node 内置模块，以免被 credit-service →
 * instrumentation 的打包链带入不允许 Node 内置的运行时包，导致构建失败。
 */
export async function assertWorkspaceWritable(
  workspaceId?: string | null,
): Promise<void> {
  if (!workspaceId) return;
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { status: true },
  });
  if (!ws) return;
  if (ws.status === "ARCHIVED" || ws.status === "DISABLED") {
    throw new WorkspaceReadOnlyError(ws.status);
  }
}
