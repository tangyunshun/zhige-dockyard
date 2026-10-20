import { prisma } from "@/lib/prisma";

/**
 * 生成唯一的企业空间名称。
 *
 * 规则：默认「企业空间-<用户名>」；若该用户名下已存在同名（含留空连建多个的场景），
 * 自动追加序号区分：企业空间-test-01、企业空间-test-01-2、企业空间-test-01-3…
 * 用户在新建表单里填了名称则优先用用户的（本函数仅在"留空/升级"时调用）。
 * 拿不到用户名时兜底唯一随机码。
 */
export async function generateEnterpriseWorkspaceName(
  userId: string,
  userName?: string | null,
): Promise<string> {
  const uname = (userName || "").trim();
  const base = uname
    ? `企业空间-${uname}`
    : `企业空间-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  const existing = await prisma.workspace.findMany({
    where: { ownerId: userId, name: { startsWith: base } },
    select: { name: true },
  });
  const taken = new Set(existing.map((e) => e.name));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}
