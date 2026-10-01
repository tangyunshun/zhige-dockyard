/**
 * 显式设置模型部署能力（批次 1A 运维工具）。
 *
 * 设计约束（不可违反）：
 *  - 必须显式传入 --deploymentId 与 --capabilities，**禁止**默认选择第一条部署；
 *  - 能力值必须来自抽象能力白名单（ALLOWED_MODEL_CAPABILITIES），不得写入具体厂商/模型名；
 *  - 幂等：若当前能力集合已等于目标集合（忽略顺序/大小写），不执行任何写入并退出 0；
 *  - 仅写入 modeldeployment.capabilities，绝不触碰价格、成本、结算开关、billingMode；
 *  - 绝不打印任何密钥或环境变量；输出仅含 deploymentId/providerId/modelId/enabled/capabilities。
 *
 * 用法：
 *   npx tsx scripts/set-deployment-capabilities.ts --deploymentId <id> --capabilities TEXT_GENERATION
 */
import { prisma } from "@/lib/prisma";
import { ALLOWED_MODEL_CAPABILITIES, extractRequiredCapabilities } from "@/lib/component-contract/capabilities";

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        out[key] = next;
        i++;
      } else {
        out[key] = "";
      }
    }
  }
  return out;
}

function normCaps(caps: unknown): string[] {
  if (!Array.isArray(caps)) return [];
  return (caps as unknown[])
    .filter((c): c is string => typeof c === "string")
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
}

function setEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = new Set(a);
  return b.every((x) => sa.has(x));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const deploymentId = (args.deploymentId || "").trim();
  const capabilitiesRaw = (args.capabilities || "").trim();

  if (!deploymentId) {
    throw new Error("必须显式传入 --deploymentId（禁止默认选择第一条部署）");
  }
  if (!capabilitiesRaw) {
    throw new Error("必须显式传入 --capabilities（逗号分隔的抽象能力，如 TEXT_GENERATION）");
  }

  const target = normCaps(capabilitiesRaw.split(","));
  const invalid = target.filter((c) => !(ALLOWED_MODEL_CAPABILITIES as ReadonlySet<string>).has(c));
  if (invalid.length > 0) {
    throw new Error(`不支持的模型能力: ${invalid.join(", ")}（仅允许抽象能力白名单）`);
  }

  const dep = await prisma.modeldeployment.findUnique({
    where: { id: deploymentId },
    select: {
      id: true,
      providerId: true,
      modelId: true,
      upstreamModel: true,
      contextLimit: true,
      enabled: true,
      capabilities: true,
    },
  });
  if (!dep) {
    throw new Error(`部署不存在: ${deploymentId}`);
  }

  const current = normCaps(dep.capabilities);
  const summary = {
    deploymentId: dep.id,
    providerId: dep.providerId,
    modelId: dep.modelId,
    upstreamModel: dep.upstreamModel,
    enabled: dep.enabled,
    contextLimit: dep.contextLimit,
    capabilitiesBefore: current,
    capabilitiesTarget: target,
  };

  if (setEqual(current, target)) {
    console.log(JSON.stringify({ status: "NO_OP", ...summary }, null, 2));
    await prisma.$disconnect();
    return;
  }

  await prisma.modeldeployment.update({
    where: { id: deploymentId },
    data: { capabilities: target },
  });

  const after = await prisma.modeldeployment.findUnique({
    where: { id: deploymentId },
    select: { id: true, providerId: true, modelId: true, enabled: true, capabilities: true },
  });

  console.log(
    JSON.stringify(
      {
        status: "UPDATED",
        ...summary,
        capabilitiesAfter: normCaps(after?.capabilities),
      },
      null,
      2,
    ),
  );

  // 仅作为证据输出 C07 当前有效合同的 requiredCapabilities（不修改）
  const c07 = await prisma.componentcatalog.findUnique({
    where: { id: "C07" },
    select: { activeContractId: true },
  });
  if (c07?.activeContractId) {
    const ac = await prisma.componentcontract.findUnique({
      where: { id: c07.activeContractId },
      select: { lifecycle: true, contract: true },
    });
    const cj: any = ac?.contract;
    const reqCaps: string[] = extractRequiredCapabilities(cj);
    console.log(
      JSON.stringify(
        {
          evidence: {
            c07ActiveContractLifecycle: ac?.lifecycle,
            c07RequiredCapabilities: reqCaps,
            deploymentSatisfiesC07: reqCaps.every((c) => target.includes(c)),
          },
        },
        null,
        2,
      ),
    );
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("ERROR:", (e as Error).message);
  process.exit(1);
});
