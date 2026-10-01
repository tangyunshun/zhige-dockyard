/**
 * 清理历史测试组件（TEST_COMP_* / API_TEST_C_*）—— 破坏性迁移，需人工确认
 *
 * 背景：
 *  - componentcatalog 表中混入 28 个测试脚手架组件（id 前缀 TEST_COMP_ / API_TEST_C_），
 *    全部 isPublished=true，泄漏进公开组件大厅 /studio；均为一次性脚本/手动测试写入的残留。
 *  - 名称显式含「测试」，创建时间集中在 2026-09-20，无任何工作空间绑定、无操作日志。
 *
 * 外键约束（prisma/schema.prisma）：
 *  - componentcatalog.activeContractId → componentcontract.id  (onDelete: Restrict)
 *  - componentcontract.componentId      → componentcatalog.id  (onDelete: Restrict)
 *  → 必须先置空 activeContractId，再删合同，最后删组件，否则会被 Restrict 拦截。
 *
 * 运行方式：
 *  - 预览（只读，不写库）：  npx tsx scripts/cleanup-test-components.ts
 *  - 执行删除：            npx tsx scripts/cleanup-test-components.ts --apply --confirm=DELETE-TEST-COMPS
 */

import { prisma } from "../src/lib/prisma";

const TARGET_PREFIXES = ["TEST_COMP_", "API_TEST_C_"] as const;
const CONFIRM_TOKEN = "DELETE-TEST-COMPS";

async function resolveTargets() {
  return prisma.componentcatalog.findMany({
    where: { OR: TARGET_PREFIXES.map((p) => ({ id: { startsWith: p } })) },
    select: { id: true, name: true, activeContractId: true },
    orderBy: { id: "asc" },
  });
}

async function countChildren(ids: string[]) {
  if (ids.length === 0) {
    return { contracts: 0, favorites: 0, ratings: 0, reviews: 0, stats: 0, usages: 0, permissions: 0 };
  }
  const [contracts, favorites, ratings, reviews, stats, usages, permissions] = await Promise.all([
    prisma.componentcontract.count({ where: { componentId: { in: ids } } }),
    prisma.componentfavorite.count({ where: { componentId: { in: ids } } }),
    prisma.componentrating.count({ where: { componentId: { in: ids } } }),
    prisma.componentreview.count({ where: { componentId: { in: ids } } }),
    prisma.componentstats.count({ where: { componentId: { in: ids } } }),
    prisma.componentusage.count({ where: { componentId: { in: ids } } }),
    prisma.componentpermission.count({ where: { componentId: { in: ids } } }),
  ]);
  return { contracts, favorites, ratings, reviews, stats, usages, permissions };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const confirmArg = args.find((a) => a.startsWith("--confirm="));
  const confirm = confirmArg ? confirmArg.slice("--confirm=".length) : "";

  if (apply && confirm !== CONFIRM_TOKEN) {
    console.error(`[cleanup-test-components] 拒绝执行：--apply 必须配合 --confirm=${CONFIRM_TOKEN}`);
    process.exit(2);
  }

  const targets = await resolveTargets();
  const ids = targets.map((t) => t.id);
  const withActive = targets.filter((t) => t.activeContractId).map((t) => t.id);
  const children = await countChildren(ids);

  console.log("=== 测试组件清理预览（dry-run） ===");
  console.log(
    JSON.stringify(
      {
        mode: apply ? "APPLY" : "DRY-RUN",
        targets: TARGET_PREFIXES,
        componentCount: ids.length,
        componentsWithActiveContract: withActive.length,
        children,
        ids,
      },
      null,
      2,
    ),
  );

  if (!apply) {
    console.log("\n[INFO] 以上为预览，未做任何修改。确认无误后执行：");
    console.log(`  npx tsx scripts/cleanup-test-components.ts --apply --confirm=${CONFIRM_TOKEN}`);
    await prisma.$disconnect();
    return;
  }

  // ---- 执行删除（顺序受 Restrict 外键约束限制） ----
  console.log("\n[APPLY] 开始清理...");

  // 1) 置空 activeContractId，解除 catalog → contract 的 Restrict 引用
  if (withActive.length > 0) {
    const r = await prisma.componentcatalog.updateMany({
      where: { id: { in: withActive } },
      data: { activeContractId: null },
    });
    console.log(`  [1/4] 置空 activeContractId: ${r.count} 行`);
  } else {
    console.log("  [1/4] 无需置空 activeContractId");
  }

  // 2) 删除子表孤儿行（componentId 为普通索引列，非外键；先清避免遗留）
  const childDeletes: Record<string, number> = {};
  childDeletes.contracts = (await prisma.componentcontract.deleteMany({ where: { componentId: { in: ids } } })).count;
  childDeletes.favorites = (await prisma.componentfavorite.deleteMany({ where: { componentId: { in: ids } } })).count;
  childDeletes.ratings = (await prisma.componentrating.deleteMany({ where: { componentId: { in: ids } } })).count;
  childDeletes.reviews = (await prisma.componentreview.deleteMany({ where: { componentId: { in: ids } } })).count;
  childDeletes.stats = (await prisma.componentstats.deleteMany({ where: { componentId: { in: ids } } })).count;
  childDeletes.usages = (await prisma.componentusage.deleteMany({ where: { componentId: { in: ids } } })).count;
  childDeletes.permissions = (await prisma.componentpermission.deleteMany({ where: { componentId: { in: ids } } })).count;
  console.log(`  [2/4] 删除子表孤儿行: ${JSON.stringify(childDeletes)}`);

  // 3) 再次确保 contracts 已清空（双保险）
  const remainContracts = await prisma.componentcontract.count({ where: { componentId: { in: ids } } });
  if (remainContracts > 0) {
    console.error(`  [3/4] 仍有 ${remainContracts} 条合同未删除，中止删除组件以免违反 Restrict`);
    process.exit(1);
  }

  // 4) 删除组件本体
  const del = await prisma.componentcatalog.deleteMany({ where: { id: { in: ids } } });
  console.log(`  [3-4/4] 删除 componentcatalog: ${del.count} 行`);

  console.log(`\n[DONE] 共清理 ${del.count} 个测试组件及其关联数据。`);
  await prisma.$disconnect();
}

main()
  .catch((e) => {
    console.error("[cleanup-test-components] 清理失败:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
