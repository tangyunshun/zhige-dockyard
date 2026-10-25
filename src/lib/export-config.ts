import { prisma } from "@/lib/prisma";

/** systemconfig 键名：导出条数上限 */
export const EXPORT_MAX_ROWS_KEY = "export.maxRows";
/** 导出条数上限默认值 */
export const EXPORT_MAX_ROWS_DEFAULT = 5000;
/** 客户端可直接使用的默认上限（服务端以 systemconfig 为准） */
export const EXPORT_MAX_ROWS = EXPORT_MAX_ROWS_DEFAULT;

/**
 * 服务端读取导出条数上限：优先取 systemconfig.export.maxRows，
 * 读取失败或值非法时退回默认 5000（绝不阻塞导出）。
 */
export async function getExportMaxRows(): Promise<number> {
  try {
    const row = await prisma.systemconfig.findUnique({ where: { key: EXPORT_MAX_ROWS_KEY } });
    if (row?.value != null) {
      const n = Number(row.value);
      if (Number.isFinite(n) && n > 0) return Math.floor(n);
    }
  } catch {
    /* 配置不可读时退回缺省 */
  }
  return EXPORT_MAX_ROWS_DEFAULT;
}
