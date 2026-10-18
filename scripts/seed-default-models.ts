/**
 * 种子数据：登记「平台默认模型」（platformdefaultmodel）。
 *
 * 分类规则（可运营在后台手动调整）：
 *  - 命名含 "flash"（轻量档）视为 免费默认(FREE)：所有新空间自动继承；
 *  - 其余（旗舰档）视为 付费默认(PAID)：仅企业空间升级时注入白名单、额外可用。
 *
 * 作用：
 *  - FREE 决定个人空间「默认能用哪些模型」；
 *  - PAID 决定企业空间「比个人多哪些付费模型」（升级流程自动注入白名单）。
 *
 * 幂等性：platformdefaultmodel 上有 @@unique([deploymentId, kind])。
 *  - 目标类别已存在则跳过；
 *  - 同时清理「另一类别」的冗余记录，保证一个模型只属于一种默认类别，避免语义冲突。
 *
 * 运行：npx tsx scripts/seed-default-models.ts
 */
import { prisma } from "@/lib/prisma";

type Kind = "FREE" | "PAID";

// 命名启发式：轻量 flash 档 = 免费；其余 = 付费。运营可后台调整每个模型的 kind。
function resolveKind(displayName: string, modelId: string): Kind {
  return /flash/i.test(displayName) || /flash/i.test(modelId) ? "FREE" : "PAID";
}

async function main() {
  const deployments = await prisma.modeldeployment.findMany({
    where: { enabled: true },
    select: { id: true, displayName: true, modelId: true },
    orderBy: { createdAt: "asc" },
  });

  let created = 0;
  let skipped = 0;
  let removed = 0;

  for (const d of deployments) {
    const target = resolveKind(d.displayName, d.modelId);
    const other: Kind = target === "FREE" ? "PAID" : "FREE";

    // 清理另一类别的冗余记录（例如之前误登记为 PAID 的 flash 模型）
    const del = await prisma.platformdefaultmodel.deleteMany({
      where: { deploymentId: d.id, kind: other },
    });
    if (del.count > 0) removed += del.count;

    const exists = await prisma.platformdefaultmodel.findUnique({
      where: { deploymentId_kind: { deploymentId: d.id, kind: target } },
    });
    if (exists) {
      skipped++;
      continue;
    }
    await prisma.platformdefaultmodel.create({
      data: { deploymentId: d.id, kind: target, enabled: true },
    });
    created++;
    console.log(`已登记 ${target} 默认模型：${d.displayName} (${d.modelId})`);
  }

  const all = await prisma.platformdefaultmodel.findMany({ orderBy: [{ kind: "asc" }, { sortOrder: "asc" }] });
  console.log(`\n处理完成：新增 ${created}，跳过(已存在) ${skipped}，清理冗余 ${removed}；共扫描 ${deployments.length} 个启用模型`);
  console.log("当前平台默认模型全量：");
  for (const m of all) {
    console.log(`- ${m.kind} | deploymentId=${m.deploymentId} | enabled=${m.enabled}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
