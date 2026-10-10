/**
 * E4 合同升版激活（1.0.0 → 1.0.1）：非破坏性归档旧版本并激活修复版。
 * 修复内容：JSON 组件 summary 类型约束放宽（object/string/null），解决 OUTPUT_VALIDATION_FAILED。
 * 范围严格限定 C46-C60，绝不触碰 C07/C09 与其它批次。
 */
async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { archiveContract, publishContract } = await import("../src/lib/component-contract/repository");
  const IDS = ["C46", "C47", "C48", "C49", "C50", "C51", "C52", "C53", "C54", "C55", "C56", "C57", "C58", "C59", "C60"];
  const FORBIDDEN = new Set(["C07", "C09"]);

  const admin = await prisma.user.findFirst({
    where: { role: { in: ["SUPER_ADMIN", "superadmin", "SUPERADMIN", "super_admin"] } },
    select: { id: true },
  });
  if (!admin) {
    console.error("NO_SUPER_ADMIN");
    await prisma.$disconnect();
    process.exit(2);
  }

  const rows: Array<Record<string, unknown>> = [];
  for (const id of IDS) {
    if (FORBIDDEN.has(id)) continue;
    const comp = await prisma.componentcatalog.findUnique({
      where: { id },
      select: { activeContractId: true },
    });
    // 先发布并激活 1.0.1（切换激活指针，1.0.0 自动转为非激活 PUBLISHED）
    await publishContract({
      componentId: id,
      contractVersion: "1.0.1",
      publishedBy: admin.id,
      autoActivate: true,
    });
    // 再归档旧的 1.0.0（此时已非激活，允许归档）
    const cur = await prisma.componentcontract.findUnique({
      where: { componentId_contractVersion: { componentId: id, contractVersion: "1.0.0" } },
      select: { lifecycle: true },
    });
    if (cur && cur.lifecycle !== "ARCHIVED") {
      await archiveContract({ componentId: id, contractVersion: "1.0.0", operatorId: admin.id });
    }
    const after = await prisma.componentcatalog.findUnique({ where: { id }, select: { activeContractId: true } });
    const v = after?.activeContractId
      ? await prisma.componentcontract.findUnique({ where: { id: after.activeContractId }, select: { contractVersion: true } })
      : null;
    rows.push({ componentId: id, archived: "1.0.0", activeVersion: v?.contractVersion ?? null });
  }
  console.log(JSON.stringify({ purpose: "E4 升版激活 1.0.1", rows }, null, 2));
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error("ACTIVATE_FAIL", (e as Error)?.message || String(e));
  process.exit(2);
});
export {};
