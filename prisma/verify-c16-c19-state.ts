/**
 * 批次 2E 合同落地状态只读核验（零副作用，不写库、不调用模型）。
 * 仅确认：C16/C17/C19 已 PUBLISHED 且为组件激活合同；C18 仅 DRAFT（未发布、未激活）。
 * 用法：npx tsx prisma/verify-c16-c19-state.ts
 */
async function main() {
  const { prisma } = await import("../src/lib/prisma");

  const ids = ["C16", "C17", "C18", "C19"];
  const rows = await prisma.componentcontract.findMany({
    where: { componentId: { in: ids } },
    select: {
      componentId: true,
      contractVersion: true,
      lifecycle: true,
      publishedAt: true,
      publishedBy: true,
    },
    orderBy: [{ componentId: "asc" }, { createdAt: "asc" }],
  });

  const active = await prisma.componentcatalog.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, activeContractId: true },
  });

  const activeMap = new Map(active.map((a) => [a.id, a]));
  const contractsByComp = new Map<string, Array<{ version: string; lifecycle: string; publishedAt: string | null; publishedBy: string | null }>>();
  for (const r of rows) {
    const arr = contractsByComp.get(r.componentId) ?? [];
    arr.push({
      version: r.contractVersion,
      lifecycle: r.lifecycle,
      publishedAt: r.publishedAt ? r.publishedAt.toISOString() : null,
      publishedBy: r.publishedBy,
    });
    contractsByComp.set(r.componentId, arr);
  }

  const results: Array<Record<string, unknown>> = [];
  for (const id of ids) {
    const contracts = contractsByComp.get(id) ?? [];
    const published = contracts.filter((c) => c.lifecycle === "PUBLISHED");
    const draft = contracts.filter((c) => c.lifecycle === "DRAFT");
    const comp = activeMap.get(id);
    const expectedPublished = id !== "C18";

    let state = "UNEXPECTED";
    if (expectedPublished) {
      if (published.length === 1 && draft.length === 0 && comp?.activeContractId) {
        state = "OK_PUBLISHED_ACTIVE";
      } else if (published.length >= 1) {
        state = "PUBLISHED_BUT_CHECK_ACTIVE";
      } else {
        state = "MISSING_PUBLISHED";
      }
    } else {
      if (published.length === 0 && draft.length >= 1 && !comp?.activeContractId) {
        state = "OK_DRAFT_BLOCKED";
      } else {
        state = "DRAFT_CHECK";
      }
    }

    results.push({
      componentId: id,
      name: comp?.name ?? null,
      contracts,
      activeContractId: comp?.activeContractId ?? null,
      expectedPublished,
      state,
    });
  }

  console.log(JSON.stringify({ batch: "2E", readOnlyVerify: true, results }, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("VERIFY_FAIL", (e as Error)?.message || String(e));
  process.exit(2);
});

export {};
