/**
 * 只读核对：C01 / C02 / C07 当前数据库激活合同 vs 测试 fixture（active-contracts.snapshot.ts）
 *
 * 红线：
 *  - 仅做只读查询（findUnique），绝不写库、绝不改合同、绝不发布/激活；
 *  - 仅输出允许的对比字段，绝不打印 prompt / 原始输入 / 密钥 / 完整合同内容；
 *  - 仅报告差异，绝不自动修改 fixture；
 *  - 若数据库与 fixture 不一致，以非零码退出并列出组件、字段、数据库值与 fixture 值（交由负责人裁决）。
 */
import path from "path";
import { fileURLToPath } from "url";
import { prisma } from "../src/lib/prisma";
import { extractRequiredCapabilities } from "../src/lib/component-contract/capabilities";
import {
  C01_ACTIVE_CONTRACT,
  C02_ACTIVE_CONTRACT,
  C07_ACTIVE_CONTRACT,
} from "../src/app/api/studio/__tests__/fixtures/active-contracts.snapshot";

type AnyContract = Record<string, unknown>;

function deriveRequiredCapabilities(c: AnyContract | null): string[] {
  return extractRequiredCapabilities(c);
}

function allowedView(c: AnyContract | null) {
  if (!c) return null;
  const input = (c.input as AnyContract) ?? null;
  const output = (c.output as AnyContract) ?? null;
  const quality = (c.qualityPolicy as AnyContract) ?? null;
  const billing = (c.billingPolicy as AnyContract) ?? null;
  return {
    componentId: typeof c.componentId === "string" ? c.componentId : null,
    contractVersion: typeof c.contractVersion === "string" ? c.contractVersion : null,
    lifecycle: typeof c.lifecycle === "string" ? c.lifecycle : null,
    inputKind: input && typeof input.kind === "string" ? input.kind : null,
    textConstraints: input?.textConstraints ?? null,
    fileConstraints: input?.fileConstraints ?? null,
    outputKind: output && typeof output.kind === "string" ? output.kind : null,
    outputArtifactMime: output && typeof output.artifactMime === "string" ? output.artifactMime : null,
    outputRendererType: output && typeof output.rendererType === "string" ? output.rendererType : null,
    requiredCapabilities: deriveRequiredCapabilities(c),
    requireHumanReview: quality ? quality.requireHumanReview === true : false,
    requiredSectionsExists: !!(quality && Array.isArray((quality as AnyContract).requiredSections) && ((quality as AnyContract).requiredSections as unknown[]).length > 0),
    disclaimerPolicyExists: !!(quality && (quality as AnyContract).disclaimerPolicy),
    qualityPolicyExists: !!quality,
    billingPolicyExists: !!billing,
    billingPolicyMode: billing && typeof billing.mode === "string" ? billing.mode : null,
    failureRefundPolicyExists: !!(c as AnyContract).failureRefundPolicy,
  };
}

const TARGETS: Array<{ componentId: string; fixture: AnyContract }> = [
  { componentId: "C01", fixture: C01_ACTIVE_CONTRACT as unknown as AnyContract },
  { componentId: "C02", fixture: C02_ACTIVE_CONTRACT as unknown as AnyContract },
  { componentId: "C07", fixture: C07_ACTIVE_CONTRACT as unknown as AnyContract },
];

async function main() {
  const report: Array<{ componentId: string; activeContractId: string | null; diffs: string[] }> = [];
  let mismatched = false;

  for (const { componentId, fixture } of TARGETS) {
    const row = await prisma.componentcatalog.findUnique({
      where: { id: componentId },
      select: { id: true, activeContractId: true },
    });
    const activeContractId = row?.activeContractId ?? null;
    const dbContract = activeContractId
      ? await prisma.componentcontract.findUnique({
          where: { id: activeContractId },
          select: { contractVersion: true, lifecycle: true, contract: true },
        })
      : null;
    const dbRaw = (dbContract?.contract as AnyContract) ?? null;
    const dbView = allowedView(dbRaw);
    const fixtureView = allowedView(fixture);

    const diffs: string[] = [];
    if (!dbContract) {
      diffs.push("数据库无激活合同（activeContractId 无效或缺失）");
    } else {
      const keys: Array<keyof NonNullable<typeof dbView>> = [
        "componentId",
        "contractVersion",
        "lifecycle",
        "inputKind",
        "textConstraints",
        "fileConstraints",
        "outputKind",
        "outputArtifactMime",
        "outputRendererType",
        "requiredCapabilities",
        "requireHumanReview",
        "requiredSectionsExists",
        "disclaimerPolicyExists",
        "qualityPolicyExists",
        "billingPolicyExists",
        "billingPolicyMode",
        "failureRefundPolicyExists",
      ];
      for (const k of keys) {
        const dv = dbView ? (dbView as AnyContract)[k] : undefined;
        const fv = fixtureView ? (fixtureView as AnyContract)[k] : undefined;
        if (JSON.stringify(dv) !== JSON.stringify(fv)) {
          diffs.push(`${String(k)}: DB=${JSON.stringify(dv)} FIXTURE=${JSON.stringify(fv)}`);
        }
      }
    }

    report.push({ componentId, activeContractId, diffs });
    if (diffs.length > 0) mismatched = true;
  }

  // 仅输出允许的对比字段（不打印 prompt / 输入 / 密钥 / 完整合同）
  console.log("=== C01/C02/C07 只读合同核对（DB vs fixture）===");
  for (const r of report) {
    console.log(`\n[${r.componentId}] activeContractId=${r.activeContractId ?? "null"}`);
    if (r.diffs.length === 0) {
      console.log("  一致：数据库激活合同与 fixture 全部允许字段匹配");
    } else {
      console.log("  差异：");
      for (const d of r.diffs) console.log("   - " + d);
    }
  }

  await prisma.$disconnect();

  if (mismatched) {
    console.error("\n[核对失败] 数据库与 fixture 不一致，已停止三组件验收，待负责人裁决。");
    process.exit(1);
  }
  console.log("\n[核对通过] 数据库激活合同与 fixture 一致，fixture 可作为当前生产事实来源。");
}

const isRunDirectly =
  process.argv[1] != null && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isRunDirectly) {
  main().catch(async (e) => {
    console.error("[verify-active-contracts-vs-fixture] 失败:", (e as Error)?.message || String(e));
    process.exit(2);
  });
}

export { allowedView };
