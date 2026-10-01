/**
 * 组件合同审计 + 最小批次迁移（数据库驱动 / dry-run 默认 / 幂等 / 可审计）
 *
 * 设计约束（对应交付要求）：
 *  1. 绝不一次性硬编码 59 个组件：批量目标必须来自 --plan=<json> 显式声明，脚本自身不含任何组件清单；
 *  2. 逐组件报告缺失字段，**不使用默认值静默补齐**（缺失即列入 missing，人工补写）；
 *  3. 输入能力（文本/文件/多文件/图片）由数据库列 input_mode / accept 派生，不做组件特判；
 *  4. requiredCapabilities / outputKind / artifact 类型 / 失败退款策略来自**激活合同**，
 *     无激活合同则如实报告为缺失，绝不猜测；artifact 类型复用中立模块的穷举映射，不复制第二套逻辑；
 *  5. 迁移仅创建 DRAFT 合同（绝不 PUBLISHED、绝不改 activeContractId），经 validateComponentContract 把关，
 *     幂等：已存在同 (componentId, contractVersion) 则跳过；
 *  6. 禁止把所有组件套成同一种输入/输出结构：每条 plan 各自声明 inputKind / outputKind。
 *
 * 用法：
 *   npx tsx scripts/audit-component-contracts.ts                                   # 只读审计（推荐）
 *   npx tsx scripts/audit-component-contracts.ts --json                            # 输出完整 JSON 报告
 *   npx tsx scripts/audit-component-contracts.ts --plan=<path>                      # 预演迁移（不写库）
 *   npx tsx scripts/audit-component-contracts.ts --plan=<path> --apply              # 执行迁移（仅 DRAFT）
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import { prisma } from "../src/lib/prisma";
import { extractRequiredCapabilities } from "../src/lib/component-contract/capabilities";
import { OUTPUT_KIND_TO_ARTIFACT_TYPE } from "../src/lib/component-contract/artifact";
import { validateComponentContract } from "../src/lib/component-contract/validators";
import type { ComponentOutputKind } from "../src/lib/component-contract/types";

/** 迁移计划中的单条声明（每组件独立声明，禁止统一模板） */
interface PlanEntry {
  componentId: string;
  contractVersion: string;
  inputKind: string;
  outputKind: string;
  rendererType: string;
  artifactMime: string;
  schemaVersion: string;
  requiredCapabilities: string[];
  /** 失败退款策略声明（业务决策，必须显式给出） */
  failureRefundPolicy: string;
  /** 输入约束由计划显式声明（不同组件结构不同，禁止统一模板） */
  textConstraints?: Record<string, unknown>;
  fileConstraints?: Record<string, unknown>;
}

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tiff"]);

function parseArgs(argv: string[]) {
  const out: Record<string, string | boolean> = {};
  for (const raw of argv) {
    const m = raw.match(/^--([^=]+)(?:=(.*))?$/);
    if (!m) continue;
    out[m[1]] = m[2] === undefined ? true : m[2];
  }
  return out;
}

function splitList(v: string | null): string[] {
  if (!v) return [];
  return v
    .split(/[,;、\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** 由数据库列派生输入能力（不做任何组件特判） */
function deriveInput(dbInputMode: string | null, dbAccept: string | null) {
  const mode = (dbInputMode || "").toLowerCase();
  const accept = (dbAccept || "").toLowerCase();
  const exts = accept.match(/\.[a-z0-9]+/g) || [];
  const supportsText = mode === "text" || mode === "both" || mode === "";
  const supportsFile = mode === "file" || mode === "both";
  return {
    supportsText,
    supportsFile,
    supportsMultiFile: null, // 多文件属合同语义（inputKind=MULTI_FILE），数据库无此信息 → 不猜测
    supportsImage: supportsFile && exts.some((e) => IMAGE_EXT.has(e)),
    acceptedExtensions: exts,
  };
}

export interface AuditComponentInput {
  component: {
    id: string;
    name: string;
    inputMode: string | null;
    accept: string | null;
    isPublished: boolean;
    activeContractId: string | null;
  };
  activeContract: {
    id: string;
    componentId: string;
    contractVersion: string;
    lifecycle: string;
    contract: unknown;
  } | null;
}

export interface AuditedComponent {
  componentId: string;
  name: string;
  isPublished: boolean;
  db: { inputMode: string | null; accept: string | null };
  derived: ReturnType<typeof deriveInput>;
  contract: {
    activeContractId: string | null;
    lifecycle: string | null;
    contractVersion: string | null;
    inputKind: string | null;
    outputKind: string | null;
    artifactType: string | null;
    requiredCapabilities: string[] | null;
    requiresStructuredOutput: boolean | null;
    billingPolicyMode: string | null;
  };
  missing: string[];
}

/**
 * 逐组件只读审计（纯函数，可单测）：报告缺失字段，绝不静默用默认值补齐。
 *
 * 正式口径（与项目总纲 / ComponentContract 类型一致）：
 *  - billingPolicy.mode（ComponentContract 已定义）为合同计费口径；
 *  - 退款由 refund 服务（refund-status.ts）按 pointledger / refundrecovery 事实派生，
 *    不依赖合同内的 failureRefundPolicy 字符串字段（该字段不在类型与总纲中，故不再要求）。
 */
export function auditComponentContractEntry(input: AuditComponentInput): AuditedComponent {
  const c = input.component;
  const active = input.activeContract;
  const raw = active?.contract as Record<string, unknown> | undefined;
  const dbInput = c.inputMode;
  const dbAccept = c.accept;
  const derived = deriveInput(dbInput, dbAccept);
  const inputKind = raw?.input ? String((raw.input as Record<string, unknown>).kind ?? "") || null : null;
  const output = raw?.output as Record<string, unknown> | undefined;
  const outputKind = output ? String(output.kind ?? "") || null : null;
  const requiredCapabilities = extractRequiredCapabilities(raw);
  const billingPolicyObj =
    raw?.billingPolicy && typeof raw.billingPolicy === "object" ? (raw.billingPolicy as Record<string, unknown>) : null;
  const billingMode = billingPolicyObj && typeof billingPolicyObj.mode === "string" ? billingPolicyObj.mode : null;
  const mapped =
    outputKind && outputKind in OUTPUT_KIND_TO_ARTIFACT_TYPE
      ? OUTPUT_KIND_TO_ARTIFACT_TYPE[outputKind as ComponentOutputKind]
      : null;

  const missing: string[] = [];
  if (!c.activeContractId) missing.push("activeContractId（无激活合同）");
  if (c.activeContractId && !active) missing.push("activeContractId 指向缺失合同");
  if (active && active.lifecycle !== "PUBLISHED") missing.push(`activeContractId 指向非 PUBLISHED（${active.lifecycle}）`);
  if (!inputKind) missing.push("input.kind");
  if (!outputKind) missing.push("output.kind");
  if (mapped === null) missing.push("artifactType（无法由 output.kind 映射）");
  if (requiredCapabilities === null || requiredCapabilities.length === 0) missing.push("requiredCapabilities");
  if (!billingMode) missing.push("billingPolicy.mode");
  if (derived.supportsMultiFile === null) missing.push("supportsMultiFile（需以合同 input.kind 声明）");
  if (!dbInput) missing.push("数据库 input_mode 未显式声明");

  return {
    componentId: c.id,
    name: c.name,
    isPublished: c.isPublished,
    db: { inputMode: dbInput, accept: dbAccept },
    derived,
    contract: {
      activeContractId: c.activeContractId,
      lifecycle: active?.lifecycle ?? null,
      contractVersion: active?.contractVersion ?? null,
      inputKind,
      outputKind,
      artifactType: mapped,
      requiredCapabilities,
      requiresStructuredOutput:
        requiredCapabilities === null
          ? null
          : requiredCapabilities.includes("STRUCTURED_OUTPUT") ||
            (outputKind !== null && ["TABLE", "SCORE", "JSON", "TIMELINE"].includes(outputKind)),
      billingPolicyMode: billingMode,
    },
    missing,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const asJson = args.json === true;
  const apply = args.apply === true;
  const planPath = typeof args.plan === "string" ? args.plan : "";

  if (apply && !planPath) {
    console.error("[audit-component-contracts] --apply 必须配合 --plan=<json>（禁止隐式批量迁移）。");
    process.exit(2);
  }

  const components = await prisma.componentcatalog.findMany({
    select: { id: true, name: true, inputMode: true, accept: true, isPublished: true, activeContractId: true },
    orderBy: { id: "asc" },
  });

  const contracts = await prisma.componentcontract.findMany({
    select: { id: true, componentId: true, contractVersion: true, lifecycle: true, contract: true },
  });
  const byId = new Map(contracts.map((c) => [c.id, c]));

  const audits = components.map((c) => {
    const active = c.activeContractId ? byId.get(c.activeContractId) : undefined;
    return auditComponentContractEntry({
      component: {
        id: c.id,
        name: c.name,
        inputMode: (c as unknown as { inputMode?: string | null }).inputMode ?? null,
        accept: (c as unknown as { accept?: string | null }).accept ?? null,
        isPublished: c.isPublished,
        activeContractId: c.activeContractId,
      },
      activeContract: active
        ? {
            id: active.id,
            componentId: active.componentId,
            contractVersion: active.contractVersion,
            lifecycle: active.lifecycle,
            contract: active.contract,
          }
        : null,
    });
  });

  const incomplete = audits.filter((a) => a.missing.length > 0);
  const inconsistent = audits.filter(
    (a) => a.contract.activeContractId && a.contract.lifecycle !== "PUBLISHED",
  );
  const summary = {
    mode: apply ? "APPLY" : "DRY-RUN",
    componentCount: audits.length,
    withActiveContract: audits.filter((a) => a.contract.activeContractId).length,
    incompleteCount: incomplete.length,
    inconsistentActiveContractCount: inconsistent.length,
    inconsistentComponentIds: inconsistent.map((a) => a.componentId),
    missingFieldHistogram: incomplete
      .flatMap((a) => a.missing)
      .reduce<Record<string, number>>((acc, k) => ((acc[k] = (acc[k] ?? 0) + 1), acc), {}),
    deletedAnything: false,
  };

  if (asJson) {
    console.log(JSON.stringify({ summary, components: audits }, null, 2));
  } else {
    console.log("=== 组件合同审计（只读，不做任何静默补齐） ===");
    console.log(JSON.stringify(summary, null, 2));
    console.log("\n--- 缺失字段明细（仅列出不完整组件） ---");
    for (const a of incomplete) {
      console.log(`${a.componentId} (${a.name}) 缺失: ${a.missing.join(" / ")}`);
    }
    const ok = audits.filter((a) => a.missing.length === 0);
    console.log(`\n完整组件 ${ok.length} / ${audits.length}`);
  }

  // ---------------- 最小批次迁移（默认预演，--apply 才写库） ----------------
  if (planPath) {
    const abs = path.resolve(process.cwd(), planPath);
    if (!fs.existsSync(abs)) {
      console.error(`[audit-component-contracts] 计划文件不存在: ${abs}`);
      process.exit(2);
    }
    const entries = JSON.parse(fs.readFileSync(abs, "utf-8")) as PlanEntry[];
    const allIds = new Set(components.map((c) => c.id));
    const results: Array<Record<string, unknown>> = [];

    for (const e of entries) {
      const problems: string[] = [];
      if (!allIds.has(e.componentId)) problems.push("组件不存在");
      if (!e.failureRefundPolicy) problems.push("缺 failureRefundPolicy（禁止默认值）");
      if (!Array.isArray(e.requiredCapabilities) || e.requiredCapabilities.length === 0)
        problems.push("缺 requiredCapabilities（禁止默认值）");
      const existing = contracts.find(
        (c) => c.componentId === e.componentId && c.contractVersion === e.contractVersion,
      );
      if (existing) {
        results.push({ ...e, action: "SKIP_EXISTS", existingId: existing.id, wroteDatabase: false });
        continue;
      }
      if (problems.length > 0) {
        results.push({ ...e, action: "REJECTED", problems, wroteDatabase: false });
        continue;
      }

      // 组装 DRAFT 合同（禁止 PUBLISHED / 禁止触碰 activeContractId）
      const draft = {
        componentId: e.componentId,
        contractVersion: e.contractVersion,
        lifecycle: "DRAFT",
        publishedAt: null,
        publishedBy: null,
        input: {
          kind: e.inputKind,
          ...(e.textConstraints ? { textConstraints: e.textConstraints } : {}),
          ...(e.fileConstraints ? { fileConstraints: e.fileConstraints } : {}),
        },
        materialPipeline: { steps: [] },
        executionPlan: {
          steps: [
            {
              stepId: "step_1",
              name: "默认执行步骤",
              promptTemplateVersion: e.contractVersion,
              promptTemplate: "请基于输入材料生成结构化结果。",
              inputMapping: {},
              outputKey: "result",
              contextBudgetTokens: 32000,
              maxOutputTokens: 4096,
              timeoutMs: 120000,
              requiredCapabilities: e.requiredCapabilities,
            },
          ],
        },
        output: {
          kind: e.outputKind,
          artifactMime: e.artifactMime,
          schemaVersion: e.schemaVersion,
          rendererType: e.rendererType,
          previewable: true,
          downloadable: false,
        },
        qualityPolicy: { allowAutoRetry: false, requireHumanReview: true },
        billingPolicy: { mode: "ESTIMATED_COMPATIBILITY" },
        failureRefundPolicy: e.failureRefundPolicy,
      };

      let validated: unknown;
      try {
        validated = validateComponentContract(draft);
      } catch (err) {
        results.push({
          ...e,
          action: "VALIDATION_FAILED",
          problems: [(err as Error)?.message || String(err)],
          wroteDatabase: false,
        });
        continue;
      }

      if (!apply) {
        results.push({ ...e, action: "WOULD_CREATE_DRAFT", problems: [], wroteDatabase: false });
        continue;
      }

      const id = `cc_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
      await prisma.componentcontract.create({
        data: {
          id,
          componentId: e.componentId,
          contractVersion: e.contractVersion,
          lifecycle: "DRAFT",
          description: "由组件合同审计脚本按显式计划创建（DRAFT，待人工评审后发布）",
          contract: validated as never,
          publishedAt: null,
          publishedBy: null,
        },
      });
      results.push({ ...e, action: "CREATED_DRAFT", contractId: id, wroteDatabase: true });
    }

    console.log(`\n=== 最小批次迁移（${apply ? "APPLY" : "DRY-RUN 预演"}） ===`);
    console.log(
      JSON.stringify(
        {
          plan: planPath,
          entryCount: entries.length,
          created: results.filter((r) => r.action === "CREATED_DRAFT").length,
          wouldCreate: results.filter((r) => r.action === "WOULD_CREATE_DRAFT").length,
          skipped: results.filter((r) => r.action === "SKIP_EXISTS").length,
          rejected: results.filter((r) => r.action === "REJECTED" || r.action === "VALIDATION_FAILED").length,
          activeContractIdTouched: false,
          publishedAnything: false,
          results,
        },
        null,
        2,
      ),
    );
  }

  await prisma.$disconnect();
}

// 仅在以脚本方式直接运行时执行 main()；被单元测试 import 时不触发任何数据库操作。
const isRunDirectly =
  process.argv[1] != null && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isRunDirectly) {
  main().catch(async (e) => {
    console.error("[audit-component-contracts] 失败:", (e as Error)?.message || String(e));
    process.exit(2);
  });
}
