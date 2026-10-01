/**
 * 组件进度视图纯函数测试
 *
 * 核心目的：证明进度页的状态派生/筛选**不依赖组件 ID 的数字范围**，
 * 未来新增 C61、C78、C100 或完全非 Cxx 命名的组件时同样可被正确展示。
 */

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import {
  READINESS_FILTERS,
  deriveReadinessStatus,
  deriveQualityHints,
  filterReadinessRows,
  summarizeReadiness,
  type ReadinessComponentRow,
} from "@/lib/component-readiness-view";
import {
  C06_CONTRACT,
  C08_CONTRACT,
  C10_CONTRACT,
  C11_CONTRACT,
} from "@/lib/component-contract/catalog-contracts-c06-c08-c10-c11";
import {
  C12_CONTRACT,
  C13_CONTRACT,
  C14_CONTRACT,
  C15_CONTRACT,
} from "@/lib/component-contract/catalog-contracts-c12-c15";

function row(partial: Partial<ReadinessComponentRow> & { componentId: string }): ReadinessComponentRow {
  return {
    isPublished: true,
    activeContractId: null,
    activeContractVersion: null,
    activeLifecycle: null,
    requiredCapabilities: [],
    missingCapabilities: [],
    executable: false,
    qualityHints: [],
    ...partial,
  };
}

/** 夹具：包含 C01（小号）、C61/C78/C100（未来新增号段）与完全非 Cxx 命名的组件 */
const FIXTURE: ReadinessComponentRow[] = [
  row({ componentId: "C01", activeContractId: "c1", activeContractVersion: "1.0.0", activeLifecycle: "PUBLISHED", requiredCapabilities: ["TEXT_GENERATION"], executable: true }),
  row({ componentId: "C07", activeContractId: "c7", activeContractVersion: "1.0.0", activeLifecycle: "PUBLISHED", requiredCapabilities: ["TEXT_GENERATION"], executable: true }),
  row({ componentId: "C08" }),
  row({ componentId: "C60" }),
  // 未来新增号段：必须与 C01/C07 同等对待（不得因数字范围被排除）
  row({ componentId: "C61", activeContractId: "c61", activeContractVersion: "1.0.0", activeLifecycle: "PUBLISHED", requiredCapabilities: ["TEXT_GENERATION"], executable: true }),
  row({ componentId: "C78", activeContractId: "c78", activeContractVersion: "1.0.0", activeLifecycle: "PUBLISHED", requiredCapabilities: ["TEXT_GENERATION", "STRUCTURED_OUTPUT"], missingCapabilities: ["STRUCTURED_OUTPUT"], executable: false }),
  // 非 Cxx 命名组件：不得被任何数字范围正则误判
  row({ componentId: "COMP_DX_01", activeContractId: "dx", activeContractVersion: "2.0.0", activeLifecycle: "PUBLISHED", requiredCapabilities: ["TEXT_GENERATION"], executable: true }),
  row({ componentId: "custom-alpha", activeContractId: "bad", activeContractVersion: "0.9.0", activeLifecycle: "DRAFT", executable: false }),
  row({ componentId: "C100", activeContractId: "c100", activeContractVersion: "1.0.0", activeLifecycle: "PUBLISHED", requiredCapabilities: ["TEXT_GENERATION"], executable: true }),
];

describe("组件进度视图（纯函数，无数字范围分组）", () => {
  test("1. 状态派生：待配置 / 可执行 / 暂不可执行 / 无效合同引用", () => {
    assert.equal(deriveReadinessStatus(row({ componentId: "X" })).label, "待配置");
    assert.equal(
      deriveReadinessStatus(
        row({ componentId: "X", activeContractId: "a", activeLifecycle: "PUBLISHED", executable: true }),
      ).label,
      "可执行",
    );
    assert.equal(
      deriveReadinessStatus(
        row({ componentId: "X", activeContractId: "a", activeLifecycle: "PUBLISHED", executable: false, missingCapabilities: ["STRUCTURED_OUTPUT"] }),
      ).label,
      "暂不可执行",
    );
    assert.equal(
      deriveReadinessStatus(row({ componentId: "X", activeContractId: "a", activeLifecycle: "DRAFT" })).label,
      "无效合同引用",
    );
    assert.equal(
      deriveReadinessStatus(row({ componentId: "X", activeContractId: "a", activeLifecycle: "ARCHIVED" })).label,
      "无效合同引用",
    );
  });

  test("2. 未来号段与非 Cxx 命名组件不得被排除（动态扩展）", () => {
    const all = filterReadinessRows(FIXTURE, "ALL");
    assert.equal(all.length, FIXTURE.length, "ALL 必须返回全部组件（不得按 ID 范围过滤）");

    for (const id of ["C61", "C78", "C100", "COMP_DX_01", "custom-alpha"]) {
      assert.ok(all.some((r) => r.componentId === id), `必须包含 ${id}`);
    }
    // C61/C100 与 C01 状态完全同源
    const byId = new Map(all.map((r) => [r.componentId, r]));
    assert.equal(deriveReadinessStatus(byId.get("C61")!).label, "可执行");
    assert.equal(deriveReadinessStatus(byId.get("C100")!).label, "可执行");
    assert.equal(deriveReadinessStatus(byId.get("C61")!).label, deriveReadinessStatus(byId.get("C01")!).label);
  });

  test("3. 五个筛选器均可筛选，且总数守恒", () => {
    assert.deepEqual(
      READINESS_FILTERS.map((f) => f.label),
      ["全部", "可执行", "待配置", "暂不可执行", "无效合同引用"],
    );

    const counts = summarizeReadiness(FIXTURE);
    assert.equal(counts.ALL, FIXTURE.length);
    assert.equal(
      counts.EXECUTABLE + counts.UNCONFIGURED + counts.NOT_EXECUTABLE + counts.INVALID_CONTRACT_REF,
      counts.ALL,
      "各状态之和必须等于总数（分类互斥且完备）",
    );

    for (const f of READINESS_FILTERS) {
      const rows = filterReadinessRows(FIXTURE, f.key);
      assert.equal(rows.length, counts[f.key], `筛选「${f.label}」结果数必须等于汇总计数`);
      if (f.key !== "ALL") {
        for (const r of rows) assert.equal(deriveReadinessStatus(r).key, f.key, `筛选结果状态必须与筛选器一致`);
      }
    }
    // 具体分布抽查
    assert.equal(counts.UNCONFIGURED, 2, "C08/C60 为待配置");
    assert.equal(counts.INVALID_CONTRACT_REF, 1, "custom-alpha（DRAFT 激活引用）为无效合同引用");
    assert.equal(counts.NOT_EXECUTABLE, 1, "C78（能力不足）为暂不可执行");
    assert.equal(counts.EXECUTABLE, 5, "C01/C07/C61/COMP_DX_01/C100 可执行");
  });

  test("4. 空列表返回空结果（不得伪造数量）", () => {
    assert.deepEqual(summarizeReadiness([]), {
      ALL: 0,
      EXECUTABLE: 0,
      UNCONFIGURED: 0,
      NOT_EXECUTABLE: 0,
      INVALID_CONTRACT_REF: 0,
    });
    assert.deepEqual(filterReadinessRows([], "ALL"), []);
    assert.deepEqual(filterReadinessRows([], "EXECUTABLE"), []);
  });

  test("5. deriveQualityHints 由合同元数据派生，不按组件 ID 硬编码", () => {
    assert.deepEqual(deriveQualityHints(undefined), [], "无合同返回空");
    assert.deepEqual(deriveQualityHints(null), [], "null 返回空");

    const c06 = deriveQualityHints(C06_CONTRACT);
    assert.ok(c06.some((h) => h.includes("ROI") || h.includes("收益")), "C06 须提示数值须人工复核");
    assert.ok(!c06.some((h) => h.includes("代码")), "C06 不提示代码审查（无 code 字段）");
    assert.ok(!c06.some((h) => h.includes("个人信息")), "C06 不提示隐私脱敏（无 privacyPolicy）");

    const c08 = deriveQualityHints(C08_CONTRACT);
    assert.ok(c08.some((h) => h.includes("schema 校验")), "C08 须提示服务端 schema 校验");
    assert.ok(!c08.some((h) => h.includes("个人信息")), "C08 不提示隐私（无 privacyPolicy）");

    const c10 = deriveQualityHints(C10_CONTRACT);
    assert.ok(c10.some((h) => h.includes("schema 校验")), "C10 须提示 schema 校验");
    assert.ok(c10.some((h) => h.includes("个人信息")), "C10 须提示个人信息脱敏");

    const c11 = deriveQualityHints(C11_CONTRACT);
    assert.ok(c11.some((h) => h.includes("代码")), "C11 须提示代码须审查（requiredProperties 含 code）");
    assert.ok(!c11.some((h) => h.includes("个人信息")), "C11 不提示隐私（无 privacyPolicy）");

    // 批次 2C（C12-C15）元数据驱动质量提示
    for (const [id, c] of [["C12", C12_CONTRACT], ["C13", C13_CONTRACT], ["C14", C14_CONTRACT]] as const) {
      const hints = deriveQualityHints(c);
      assert.ok(
        hints.some((h) => h.includes("代码") && h.includes("未经目标工程编译/运行验证")),
        `${id} 须派生未经目标工程编译/运行验证的代码审查提示`,
      );
    }
    const c15Hints = deriveQualityHints(C15_CONTRACT);
    assert.ok(c15Hints.some((h) => h.includes("schema 校验")), "C15 须提示服务端 schema 校验");
    assert.ok(!c15Hints.some((h) => h.includes("代码")), "C15 结构化缓存方案不含代码生成，不提示代码审查");
  });

  test("6. 状态=可执行 不代表 COMPLETE（进度页不得把 executable 等同验收完成）", () => {
    const s = deriveReadinessStatus(
      row({ componentId: "X", activeContractId: "a", activeLifecycle: "PUBLISHED", executable: true }),
    );
    assert.notEqual(s.key, "COMPLETE", "状态枚举不得含 COMPLETE");
    assert.notEqual(s.label, "COMPLETE", "状态文案不得为 COMPLETE");
    assert.equal(s.key, "EXECUTABLE", "可执行仅表示合同/能力允许执行");
    assert.equal(s.label, "可执行");
  });

  test("7. deriveCatalogComponentReadiness 能力门禁与就绪状态精准映射", () => {
    const { deriveCatalogComponentReadiness } = require("@/lib/component-readiness-view");

    // 1) 已发布合同能力满足 -> EXECUTABLE, contractReady: true, blockingReasons: []
    const execRes = deriveCatalogComponentReadiness({
      activeContractLifecycle: "PUBLISHED",
      activeContract: C13_CONTRACT,
      missingCapabilities: [],
    });
    assert.equal(execRes.readinessStatus, "EXECUTABLE");
    assert.equal(execRes.contractReady, true);
    assert.deepEqual(execRes.blockingReasons, []);
    assert.equal(execRes.hasPublishedContract, true);

    // 2) 已发布合同能力不足 -> NOT_EXECUTABLE, contractReady: false, 明确 blockingReasons
    const notExecRes = deriveCatalogComponentReadiness({
      activeContractLifecycle: "PUBLISHED",
      activeContract: C13_CONTRACT,
      missingCapabilities: ["VISION", "LONG_CONTEXT"],
    });
    assert.equal(notExecRes.readinessStatus, "NOT_EXECUTABLE");
    assert.equal(notExecRes.contractReady, false);
    assert.ok(notExecRes.blockingReasons.some((r: string) => r.includes("VISION") && r.includes("LONG_CONTEXT")));
    assert.equal(notExecRes.hasPublishedContract, true);

    // 3) 未发布候选即使能力满足 -> UNCONFIGURED, contractReady: false, isCandidateEligible: true
    const unconfRes = deriveCatalogComponentReadiness({
      activeContractLifecycle: null,
      candidateMeta: {
        contract: C13_CONTRACT,
        analysis: {
          activationStatus: "ELIGIBLE",
          unsupportedRequirements: [],
        },
      },
    });
    assert.equal(unconfRes.readinessStatus, "UNCONFIGURED");
    assert.equal(unconfRes.contractReady, false);
    assert.equal(unconfRes.isCandidateEligible, true);
    assert.equal(unconfRes.hasPublishedContract, false);

    // 4) C12 未支持项受控阻断 -> BLOCKED, contractReady: false, blockingReasons 包含明确原因
    const blockedRes = deriveCatalogComponentReadiness({
      activeContractLifecycle: null,
      candidateMeta: {
        contract: C12_CONTRACT,
        analysis: {
          activationStatus: "BLOCKED",
          unsupportedRequirements: ["关联拓扑图（图形化 ER 图）暂不支持"],
        },
      },
    });
    assert.equal(blockedRes.readinessStatus, "BLOCKED");
    assert.equal(blockedRes.contractReady, false);
    assert.equal(blockedRes.isCandidateEligible, false);
    assert.ok(blockedRes.blockingReasons.some((r: string) => r.includes("图形化 ER 图")));
  });

  test("8. 构造 PUBLISHED 但缺少部署能力的组件，证明绝不会返回 EXECUTABLE", () => {
    const { deriveCatalogComponentReadiness } = require("@/lib/component-readiness-view");
    const { calculateMissingCapabilities } = require("@/lib/model-registry");

    // Case A: 已发布，合同要求 VISION + STRUCTURED_OUTPUT，但平台部署仅有 TEXT_GENERATION
    const missingCapsA = calculateMissingCapabilities(
      ["VISION", "STRUCTURED_OUTPUT"],
      ["TEXT_GENERATION"],
      true, // 部署本身可用，但能力不满足
    );
    assert.deepEqual(missingCapsA, ["VISION", "STRUCTURED_OUTPUT"]);

    const resA = deriveCatalogComponentReadiness({
      activeContractLifecycle: "PUBLISHED",
      activeContract: C13_CONTRACT,
      missingCapabilities: missingCapsA,
    });

    assert.notEqual(resA.readinessStatus, "EXECUTABLE", "缺少能力时绝不得返回 EXECUTABLE");
    assert.equal(resA.readinessStatus, "NOT_EXECUTABLE");
    assert.equal(resA.contractReady, false, "缺少能力时 contractReady 必须为 false");
    assert.ok(
      resA.blockingReasons.some((r: string) => r.includes("VISION") && r.includes("STRUCTURED_OUTPUT")),
      "blockingReasons 必须明确列出缺失的部署能力",
    );

    // Case B: 已发布，合同要求空能力（如普通纯文本），但平台默认部署不可用（未配置或已禁用）
    const missingCapsB = calculateMissingCapabilities(
      [],
      [],
      false, // 部署不可用
    );
    assert.deepEqual(missingCapsB, ["PLATFORM_DEFAULT_DEPLOYMENT_NOT_AVAILABLE"]);

    const resB = deriveCatalogComponentReadiness({
      activeContractLifecycle: "PUBLISHED",
      activeContract: C13_CONTRACT,
      missingCapabilities: missingCapsB,
    });

    assert.notEqual(resB.readinessStatus, "EXECUTABLE", "部署不可用时绝不得返回 EXECUTABLE");
    assert.equal(resB.readinessStatus, "NOT_EXECUTABLE");
    assert.equal(resB.contractReady, false, "部署不可用时 contractReady 必须为 false");
    assert.ok(
      resB.blockingReasons.some((r: string) => r.includes("状态不可确认") || r.includes("暂不可用")),
      "blockingReasons 必须说明平台部署未配置或暂不可用",
    );
  });
});

