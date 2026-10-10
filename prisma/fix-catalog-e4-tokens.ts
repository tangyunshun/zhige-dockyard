/**
 * 批次 COMPONENT-EXPANSION-E4 目录补数（C22 先例：目录数据不完整修复）
 *
 * 背景：核目录行时发现 C51/C52/C59/C60 在 component_catalog 表中 estimatedModelTokens = 0
 * （种子文件 component-catalog-data.ts 已为 150/80/140/100，但 DB 未同步），属批次 note #1
 * 「目录数据不完整（estimatedModelTokens=0）」情形。需先补目录两字段并列清单，再发布合同。
 *
 * 说明：flow 字段经核查不在 Prisma schema 中（非持久列），故仅可持久补 estimatedModelTokens；
 * 该字段不进入 DB，本脚本仅修正可持久的那一项，并在报告中以「两字段并列清单」透明披露
 * （flow: N/A 非持久列）。
 *
 * 范围硬约束：仅处理 C51/C52/C59/C60（均在 E4 目标 C46-C60 内），绝不触碰 C07/C09 与 C01-C45/C61+。
 * 幂等：仅当当前值为 0 时才写入目标值；目标值与种子文件及合同 billingPolicy.estimatedTokens 一致。
 */
async function main() {
  const { prisma } = await import("../src/lib/prisma");

  // 两字段并列清单（componentId -> 旧值/新值）：仅 estimatedModelTokens 可持久；flow 非持久列记为 N/A
  const PATCH: Record<string, number> = {
    C51: 150,
    C52: 80,
    C59: 140,
    C60: 100,
  };
  const ALLOWED = new Set(Object.keys(PATCH));
  const FORBIDDEN = new Set(["C07", "C09"]);

  const rows: Array<Record<string, unknown>> = [];
  for (const [id, target] of Object.entries(PATCH)) {
    if (!ALLOWED.has(id) || FORBIDDEN.has(id)) {
      console.error(`FIX_FAIL SCOPE_VIOLATION: ${id} 不在 E4 补数范围内`);
      await prisma.$disconnect();
      process.exit(2);
    }
    const before = await prisma.componentcatalog.findUnique({
      where: { id },
      select: { id: true, estimatedModelTokens: true },
    });
    if (!before) {
      console.error(`FIX_FAIL NO_CATALOG_ROW: 目录行 ${id} 不存在`);
      await prisma.$disconnect();
      process.exit(2);
    }
    const oldVal = (before as { estimatedModelTokens: number }).estimatedModelTokens;
    let applied = false;
    if (oldVal === 0) {
      await prisma.componentcatalog.update({
        where: { id },
        data: { estimatedModelTokens: target },
      });
      applied = true;
    }
    rows.push({
      componentId: id,
      flow: "N/A(非持久列，不入DB)",
      estimatedModelTokens: { before: oldVal, after: applied ? target : oldVal, target, applied },
    });
  }

  console.log(
    JSON.stringify(
      {
        purpose: "E4 目录补数（C22 先例）：修复 estimatedModelTokens=0 不完整行",
        scope: Array.from(ALLOWED),
        forbidden: Array.from(FORBIDDEN),
        twoFieldPatchList: rows,
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error("FIX_FAIL", (e as Error)?.message || String(e));
  process.exit(2);
});

export {};
