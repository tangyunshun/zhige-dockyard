/**
 * C01-C05 真实合同纯函数校验测试（无数据库依赖）
 *
 * 覆盖：
 *  1. 五份合同均通过 validateComponentContract 纯领域校验（含禁带模型绑定字段/密钥/可执行代码）；
 *  2. 输入/输出/能力逐组件真实差异（禁止套用相同输入输出提示词）；
 *  3. requiredCapabilities 真实基线（仅 C01/C03 声明 STRUCTURED_OUTPUT，绝不误声明 FILE_ANALYSIS）；
 *  4. 输入不符合合同时的拒绝；
 *  5. 成功输出 artifact 结构校验；
 *  6. 依据真实部署能力的激活裁决（缺失能力必须显式列出）。
 */

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import {
  C01_C05_BATCH,
  C01_C05_CONTRACTS,
  evaluateActivationEligibility,
} from "@/lib/component-contract/catalog-contracts-c01-c05";
import { validateComponentContract, validateComponentInput, validateComponentOutput } from "@/lib/component-contract/validators";
import { buildResultArtifact } from "@/lib/component-contract/artifact";
import type { ComponentContract } from "@/lib/component-contract/types";

/** 构造 PUBLISHED 副本用于输入/输出运行时校验（模板态为 DRAFT） */
function asPublished(contract: ComponentContract): ComponentContract {
  return { ...contract, lifecycle: "PUBLISHED", publishedAt: new Date().toISOString(), publishedBy: "test-operator" };
}

describe("C01-C05 合同纯函数校验", () => {
  test("1. 五份合同均通过 validateComponentContract 纯领域校验", () => {
    for (const { componentId, contract } of C01_C05_BATCH) {
      const validated = validateComponentContract(contract);
      assert.equal(validated.componentId, componentId);
      assert.equal(validated.lifecycle, "DRAFT", `${componentId} 模板态必须为 DRAFT`);
      assert.equal(validated.publishedAt, null);
      // 禁带模型绑定字段/密钥/可执行代码：validateComponentContract 内部已强校验，能通过即证明合规
    }
  });

  test("2. 合同严禁携带模型绑定字段（providerId/modelId/baseUrl/apiKey 等）", () => {
    const serialized = JSON.stringify(C01_C05_CONTRACTS);
    for (const forbidden of ["providerId", "modelId", "upstreamModel", "baseUrl", "apiKey", "apiVersion", "endpoint"]) {
      assert.ok(!serialized.includes(`"${forbidden}"`), `合同不得包含模型绑定字段: ${forbidden}`);
    }
  });

  test("3. 逐组件输入类型与输出类型真实差异（禁止套用相同输入输出）", () => {
    const byId = Object.fromEntries(C01_C05_BATCH.map((b) => [b.componentId, b.contract]));

    assert.equal(byId.C01.input.kind, "FILE");
    assert.equal(byId.C02.input.kind, "FILE");
    assert.equal(byId.C03.input.kind, "MULTI_FILE");
    assert.equal(byId.C04.input.kind, "STRUCTURED_FORM");
    assert.equal(byId.C05.input.kind, "TEXT");

    // 平台当前仅支持单一主材料：文件类合同 maxCount 必须为 1
    assert.equal(byId.C01.input.fileConstraints?.maxCount, 1);
    assert.equal(byId.C02.input.fileConstraints?.maxCount, 1);
    assert.ok((byId.C03.input.fileConstraints?.maxCount ?? 0) > 1, "C03 支持多主材料（竞品 + 我方清单）");
    assert.equal(byId.C03.contractVersion, "1.0.2", "C03 以 1.0.2 修正输入类型（历史版本快照不变）");

    // 输出类型差异：C03 为结构化表，C01/C02/C04/C05 为文档
    assert.equal(byId.C03.output.kind, "TABLE");
    assert.equal(byId.C03.output.rendererType, "STRUCTURED_TABLE");
    for (const id of ["C01", "C02", "C04", "C05"]) {
      assert.equal(byId[id].output.kind, "DOCUMENT");
      assert.equal(byId[id].output.rendererType, "MARKDOWN_DOCUMENT");
    }

    // C04 结构化表单：汇报对象（select）+ 技术方案（string）必填
    const c04Fields = byId.C04.input.formConstraints?.fields ?? [];
    assert.equal(c04Fields.length, 2);
    assert.equal(c04Fields[0].name, "audience");
    assert.equal(c04Fields[0].type, "select");
    assert.equal(c04Fields[0].required, true);
    assert.deepEqual(c04Fields[0].options, ["高管", "技术", "两者"]);
    assert.equal(c04Fields[1].name, "techPlan");
    assert.equal(c04Fields[1].required, true);

    // 文本必填规则：TEXT 模式必须声明 required
    assert.equal(byId.C05.input.textConstraints?.required, true);
  });

  test("4. requiredCapabilities 真实基线：仅 C01/C03 需要结构化输出，且无人误声明 FILE_ANALYSIS", () => {
    const capsOf = (c: ComponentContract) =>
      Array.from(new Set(c.executionPlan.steps.flatMap((s) => s.requiredCapabilities))).sort();
    const byId = Object.fromEntries(C01_C05_BATCH.map((b) => [b.componentId, b.contract]));

    assert.deepEqual(capsOf(byId.C01), ["STRUCTURED_OUTPUT", "TEXT_GENERATION"]);
    assert.deepEqual(capsOf(byId.C02), ["TEXT_GENERATION"]);
    assert.deepEqual(capsOf(byId.C03), ["STRUCTURED_OUTPUT", "TEXT_GENERATION"]);
    assert.deepEqual(capsOf(byId.C04), ["TEXT_GENERATION"]);
    assert.deepEqual(capsOf(byId.C05), ["TEXT_GENERATION"]);

    for (const { componentId, contract } of C01_C05_BATCH) {
      const caps = capsOf(contract);
      assert.ok(!caps.includes("FILE_ANALYSIS"), `${componentId} 不得因处理文件就声明 FILE_ANALYSIS`);
      assert.ok(!caps.includes("VISION"), `${componentId} 未确认视觉需求，不得声明 VISION`);
    }
  });

  test("5. 各组件提示词各不相同（禁止复制 C07 后仅改 componentId）", () => {
    const prompts = C01_C05_BATCH.map((b) => b.contract.executionPlan.steps[0].promptTemplate);
    assert.equal(new Set(prompts).size, prompts.length, "五份合同的提示词必须两两不同");
    for (const p of prompts) assert.ok(p.trim().length > 30, "提示词必须为真实业务指令，不得为占位文本");
  });

  test("6. 输入不符合合同时必须拒绝", () => {
    const byId = Object.fromEntries(C01_C05_BATCH.map((b) => [b.componentId, b.contract]));

    // C01 单文件：必须提供文件
    assert.throws(
      () => validateComponentInput(asPublished(byId.C01), { files: [] }),
      /文件输入为必填项/,
    );

    // C01 单文件：不得超过 maxCount=1
    assert.throws(
      () =>
        validateComponentInput(asPublished(byId.C01), {
          files: [
            { name: "a.pdf", mimeType: ".pdf", sizeBytes: 1000 },
            { name: "b.pdf", mimeType: ".pdf", sizeBytes: 1000 },
          ],
        }),
      /超过合同限制的最大数量/,
    );

    // C01 MIME 白名单拒绝
    assert.throws(
      () => validateComponentInput(asPublished(byId.C01), { files: [{ name: "x.exe", mimeType: ".exe", sizeBytes: 10 }] }),
      /不在合同允许的白名单中/,
    );

    // C01 单文件超限拒绝
    assert.throws(
      () => validateComponentInput(asPublished(byId.C01), { files: [{ name: "big.pdf", mimeType: ".pdf", sizeBytes: 999_999_999 }] }),
      /超过单文件上限/,
    );

    // C01 合法输入通过
    const ok = validateComponentInput(asPublished(byId.C01), { files: [{ name: "rfp.pdf", mimeType: ".pdf", sizeBytes: 1024 }] });
    assert.ok(Array.isArray((ok as { files?: unknown[] }).files));

    // C04 结构化表单：缺必填字段 / 非法 select 取值拒绝；合法输入通过
    assert.throws(
      () => validateComponentInput(asPublished(byId.C04), { formData: { audience: "高管" } }),
      /表单必填字段/,
    );
    assert.throws(
      () => validateComponentInput(asPublished(byId.C04), { formData: { audience: "董事会", techPlan: "方案内容" } }),
      /不在合法选项列表/,
    );
    const c04Ok = validateComponentInput(asPublished(byId.C04), { formData: { audience: "两者", techPlan: "微服务架构方案" } });
    assert.ok((c04Ok as { formData?: unknown }).formData);
  });

  test("7. 成功输出 artifact 结构校验（文档/结构化表）", () => {
    const byId = Object.fromEntries(C01_C05_BATCH.map((b) => [b.componentId, b.contract]));

    // C01 文档成果物（buildResultArtifact 产出 type；合同输出校验使用 kind）
    const c01Content =
      "## 招标要求与能力匹配及偏离表\n" +
      "本报告对招标要求逐条给出我方响应与能力匹配、偏离结论，并列出风险提示与替代建议。".repeat(8);
    const c01Artifact = buildResultArtifact({
      outputKind: byId.C01.output.kind,
      title: "招标要求与偏离分析报告",
      content: c01Content,
      artifactMime: byId.C01.output.artifactMime,
      schemaVersion: byId.C01.output.schemaVersion,
      rendererType: byId.C01.output.rendererType,
    });
    assert.equal(c01Artifact.type, "document");
    assert.equal(c01Artifact.mimeType, "text/markdown");
    validateComponentOutput(byId.C01, { kind: byId.C01.output.kind, content: c01Artifact.content });

    // C03 结构化表成果物
    const c03Content = {
      dimensions: ["功能完整度", "性能指标", "合规资质"],
      rows: [
        { dimension: "功能完整度", ours: "覆盖 12 项", competitor: "覆盖 9 项", verdict: "优势", note: "" },
        { dimension: "性能指标", ours: "P95 200ms", competitor: "P95 180ms", verdict: "劣势", note: "" },
      ],
      summary: "我方优势 1 项、劣势 1 项、持平 0 项，建议优先补强性能指标与合规资质材料。".repeat(2),
    };
    const c03Artifact = buildResultArtifact({
      outputKind: byId.C03.output.kind,
      title: "竞品多维对比",
      content: c03Content,
      artifactMime: byId.C03.output.artifactMime,
      schemaVersion: byId.C03.output.schemaVersion,
      rendererType: byId.C03.output.rendererType,
    });
    assert.equal(c03Artifact.type, "table");
    assert.equal(c03Artifact.mimeType, "application/json");
    validateComponentOutput(byId.C03, { kind: byId.C03.output.kind, content: c03Content });

    // C03 缺必填字段必须拒绝（内容长度达标但缺少 schema.required 字段 summary）
    assert.throws(
      () =>
        validateComponentOutput(byId.C03, {
          kind: "TABLE",
          content: { dimensions: ["功能完整度", "性能指标"], rows: [], padding: "x".repeat(120) },
        }),
      /缺失 schema 必填属性/,
    );

    // 输出类型不匹配必须拒绝
    assert.throws(
      () => validateComponentOutput(byId.C01, { kind: "TABLE", content: c01Content }),
      /与合同要求的输出类型/,
    );
  });

  test("8. 依据真实部署能力的激活裁决：仅 TEXT_GENERATION 时 C01/C03 不可激活", () => {
    const byId = Object.fromEntries(C01_C05_BATCH.map((b) => [b.componentId, b.contract]));
    const realDeploymentCapabilities = ["TEXT_GENERATION"];

    for (const id of ["C02", "C04", "C05"]) {
      const r = evaluateActivationEligibility(byId[id], realDeploymentCapabilities);
      assert.equal(r.eligible, true, `${id} 应可激活`);
      assert.deepEqual(r.missingCapabilities, []);
    }

    for (const id of ["C01", "C03"]) {
      const r = evaluateActivationEligibility(byId[id], realDeploymentCapabilities);
      assert.equal(r.eligible, false, `${id} 因缺少 STRUCTURED_OUTPUT 不得激活`);
      assert.deepEqual(r.missingCapabilities, ["STRUCTURED_OUTPUT"]);
    }

    // 补齐结构化输出能力后 C01/C03 才可激活
    const full = ["TEXT_GENERATION", "STRUCTURED_OUTPUT"];
    for (const id of ["C01", "C03"]) {
      assert.equal(evaluateActivationEligibility(byId[id], full).eligible, true);
    }
  });
});
