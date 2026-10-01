/**
 * 批次 2B（C06、C08、C10、C11）真实合同纯函数校验测试（无数据库依赖）
 *
 * 覆盖：
 *  1. 四份合同均通过 validateComponentContract 纯领域校验（含禁带模型绑定字段/密钥/可执行代码）；
 *  2. 逐组件输入/输出真实差异（禁止复制 C01-C05/C07 后仅改 componentId，禁止统一输入输出）；
 *  3. requiredCapabilities 真实基线（仅 C08/C10 声明 STRUCTURED_OUTPUT；无人声明 VISION/FILE_ANALYSIS/LONG_CONTEXT）；
 *  4. 输入不符合合同时必须拒绝；
 *  5. 成功输出 artifact 结构校验（文档 / 结构化表）；
 *  6. 依据真实部署能力的激活裁决（缺失能力必须显式列出，绝不静默放行）；
 *  7. 逐组件业务分析字段完整（批次 2B 检查清单逐项有值，不静默留空）。
 */

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import {
  BATCH_2B,
  BATCH_2B_COMPONENT_IDS,
  BATCH_2B_CONTRACTS,
  evaluateActivationEligibility,
} from "@/lib/component-contract/catalog-contracts-c06-c08-c10-c11";
import { validateComponentContract, validateComponentInput, validateComponentOutput } from "@/lib/component-contract/validators";
import { buildResultArtifact } from "@/lib/component-contract/artifact";
import type { ComponentContract } from "@/lib/component-contract/types";

/** 构造 PUBLISHED 副本用于输入/输出运行时校验（模板态为 DRAFT） */
function asPublished(contract: ComponentContract): ComponentContract {
  return { ...contract, lifecycle: "PUBLISHED", publishedAt: new Date().toISOString(), publishedBy: "test-operator" };
}

const byId = Object.fromEntries(BATCH_2B.map((b) => [b.componentId, b.contract])) as Record<string, ComponentContract>;
const analysisById = Object.fromEntries(BATCH_2B.map((b) => [b.componentId, b.analysis]));

const capsOf = (c: ComponentContract) =>
  Array.from(new Set(c.executionPlan.steps.flatMap((s) => s.requiredCapabilities))).sort();

/** 当前平台默认部署的**实测**能力（数据库真实值） */
const REAL_DEPLOYMENT_CAPABILITIES = ["TEXT_GENERATION", "STRUCTURED_OUTPUT"];

describe("批次 2B（C06/C08/C10/C11）合同纯函数校验", () => {
  test("1. 四份合同均通过 validateComponentContract 纯领域校验", () => {
    assert.deepEqual([...BATCH_2B_COMPONENT_IDS], ["C06", "C08", "C10", "C11"], "批次范围必须精确为 C06/C08/C10/C11");
    for (const { componentId, contract } of BATCH_2B) {
      const validated = validateComponentContract(contract);
      assert.equal(validated.componentId, componentId);
      assert.equal(validated.lifecycle, "DRAFT", `${componentId} 模板态必须为 DRAFT`);
      assert.equal(validated.publishedAt, null);
      assert.equal(validated.billingPolicy.mode, "ESTIMATED_COMPATIBILITY", `${componentId} 不得声明真实结算`);
    }
  });

  test("2. 合同严禁携带模型绑定字段与密钥（providerId/modelId/baseUrl/apiKey 等）", () => {
    const serialized = JSON.stringify(BATCH_2B_CONTRACTS);
    for (const forbidden of ["providerId", "modelId", "upstreamModel", "baseUrl", "apiKey", "apiVersion", "endpoint"]) {
      assert.ok(!serialized.includes(`"${forbidden}"`), `合同不得包含模型绑定字段: ${forbidden}`);
    }
  });

  test("3. 逐组件输入/输出结构真实差异（禁止统一；禁止仅改 componentId 的复制）", () => {
    assert.equal(byId.C06.input.kind, "TEXT", "C06 目录 inputMode=text → 纯文本");
    assert.equal(byId.C08.input.kind, "TEXT", "C08 目录 inputMode=text → 纯文本");
    assert.equal(byId.C10.input.kind, "TEXT", "C10 目录 inputMode=text → 纯文本");
    assert.equal(byId.C11.input.kind, "TEXT_AND_FILES", "C11 目录 inputMode=both → 文本或文件任一");

    // 平台当前仅支持单一主材料：文件类合同 maxCount 必须为 1
    assert.equal(byId.C11.input.fileConstraints?.maxCount, 1, "C11 单文件合同 maxCount 必须为 1");
    assert.equal(byId.C11.input.fileConstraints?.required, false, "C11 文件非必填（与文本二选一）");
    assert.ok(
      byId.C11.input.fileConstraints!.acceptedMimes.length > 0,
      "C11 必须声明 MIME 白名单（与目录 accept=.md/.txt/.pdf/.doc/.docx 对应）",
    );

    // 输出类型差异：C08/C10 为结构化表；C06/C11 为文档
    assert.equal(byId.C08.output.kind, "TABLE");
    assert.equal(byId.C08.output.rendererType, "STRUCTURED_TABLE");
    assert.equal(byId.C10.output.kind, "TABLE");
    assert.equal(byId.C10.output.rendererType, "STRUCTURED_TABLE");
    assert.equal(byId.C06.output.kind, "DOCUMENT");
    assert.equal(byId.C06.output.rendererType, "MARKDOWN_DOCUMENT");
    assert.equal(byId.C11.output.kind, "DOCUMENT");
    assert.equal(byId.C11.output.rendererType, "MARKDOWN_DOCUMENT");

    // 提示词与步骤标识两两不同，且不得为占位文本
    const prompts = BATCH_2B.map((b) => b.contract.executionPlan.steps[0].promptTemplate);
    assert.equal(new Set(prompts).size, prompts.length, "四份合同的提示词必须两两不同");
    for (const p of prompts) assert.ok(p.trim().length > 100, "提示词必须为真实业务指令，不得为占位文本");
    const stepIds = BATCH_2B.map((b) => b.contract.executionPlan.steps[0].stepId);
    const outputKeys = BATCH_2B.map((b) => b.contract.executionPlan.steps[0].outputKey);
    assert.equal(new Set(stepIds).size, stepIds.length, "stepId 必须两两不同");
    assert.equal(new Set(outputKeys).size, outputKeys.length, "outputKey 必须两两不同");

    // 输入端不得四者雷同（C11 与其余三者不同，且三份文本合同的 placeholder 各不相同）
    const placeholders = [byId.C06, byId.C08, byId.C10].map((c) => c.input.textConstraints?.placeholder);
    assert.equal(new Set(placeholders).size, 3, "三份文本合同的 placeholder 必须各不相同");
  });

  test("4. requiredCapabilities 真实基线：仅 C08/C10 需结构化输出，无人误声明 VISION/FILE_ANALYSIS/LONG_CONTEXT", () => {
    assert.deepEqual(capsOf(byId.C06), ["TEXT_GENERATION"]);
    assert.deepEqual(capsOf(byId.C08), ["STRUCTURED_OUTPUT", "TEXT_GENERATION"]);
    assert.deepEqual(capsOf(byId.C10), ["STRUCTURED_OUTPUT", "TEXT_GENERATION"]);
    assert.deepEqual(capsOf(byId.C11), ["TEXT_GENERATION"]);

    for (const { componentId, contract } of BATCH_2B) {
      const caps = capsOf(contract);
      assert.ok(!caps.includes("VISION"), `${componentId} 无图像理解需求，不得声明 VISION`);
      assert.ok(!caps.includes("FILE_ANALYSIS"), `${componentId} 文件解析由平台服务端完成，不得声明 FILE_ANALYSIS`);
      assert.ok(!caps.includes("LONG_CONTEXT"), `${componentId} 上下文预算未超常规窗口，不得声明 LONG_CONTEXT`);
    }

    // 结构化输出必须与「机器可读产物」严格对应（不得只声明能力却输出散文）
    for (const id of ["C08", "C10"]) {
      assert.ok(capsOf(byId[id]).includes("STRUCTURED_OUTPUT"), `${id} 需结构化输出`);
      assert.ok(
        ["TABLE", "SCORE", "JSON", "TIMELINE"].includes(byId[id].output.kind),
        `${id} 声明 STRUCTURED_OUTPUT 时输出必须为机器可读类型，实际 ${byId[id].output.kind}`,
      );
    }
    for (const id of ["C06", "C11"]) {
      assert.ok(!capsOf(byId[id]).includes("STRUCTURED_OUTPUT"), `${id} 输出为人类阅读文档，不得过度声明`);
      assert.equal(byId[id].output.kind, "DOCUMENT");
    }
  });

  test("5. 输入不符合合同时必须拒绝", () => {
    for (const id of ["C06", "C08", "C10"]) {
      const c = asPublished(byId[id]);
      // 缺文本
      assert.throws(() => validateComponentInput(c, {}), /文本输入为必填项/, `${id} 缺文本必须拒绝`);
      // 低于最小长度
      assert.throws(() => validateComponentInput(c, { text: "太短" }), /最小长度/, `${id} 低于最小长度必须拒绝`);
      // 超过最大长度
      assert.throws(
        () => validateComponentInput(c, { text: "x".repeat(20_001) }),
        /最大长度/,
        `${id} 超过最大长度必须拒绝`,
      );
      // 合法输入通过
      const ok = validateComponentInput(c, { text: "这是一段满足最短长度要求的真实业务输入材料，用于校验合同通过。" });
      assert.ok(typeof (ok as { text?: string }).text === "string", `${id} 合法输入必须通过`);
    }

    // C11：文件类约束（数量 / MIME / 单文件大小）
    const c11 = asPublished(byId.C11);
    assert.throws(
      () =>
        validateComponentInput(c11, {
          files: [
            { name: "a.md", mimeType: "text/markdown", sizeBytes: 100 },
            { name: "b.md", mimeType: "text/markdown", sizeBytes: 100 },
          ],
        }),
      /超过合同限制的最大数量/,
      "C11 单文件合同必须拒绝多文件",
    );
    assert.throws(
      () => validateComponentInput(c11, { files: [{ name: "x.exe", mimeType: "application/x-msdownload", sizeBytes: 10 }] }),
      /不在合同允许的白名单中/,
      "C11 必须拒绝白名单外类型",
    );
    assert.throws(
      () => validateComponentInput(c11, { files: [{ name: "big.pdf", mimeType: "application/pdf", sizeBytes: 999_999_999 }] }),
      /超过单文件上限/,
      "C11 必须拒绝超限文件",
    );
    const c11Ok = validateComponentInput(c11, { text: "设计用户注册与手机验证码登录接口，含字段校验与错误码。" });
    assert.ok((c11Ok as { text?: string }).text, "C11 合法文本输入必须通过");
    const c11FileOk = validateComponentInput(c11, { files: [{ name: "prd.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", sizeBytes: 2048 }] });
    assert.ok(Array.isArray((c11FileOk as { files?: unknown[] }).files), "C11 合法文件输入必须通过");
  });

  test("6. 成功输出 artifact 结构校验（文档 / 结构化表）", () => {
    // C06 文档成果物
    const c06Content =
      ("## 投入明细\n| 投入项 | 类别 | 金额（万元） | 说明 |\n| --- | --- | --- | --- |\n| 研发人力 | 人力 | 120 | 8 人 × 3 个月 |\n" +
        "## 收益预测与净收益\n预计月增收入 30 万元，年度净收益 132 万元。\n" +
        "## 投资回收周期与 ROI\n静态投资回收期约 6 个月，ROI 约 73%，计算式：累计净收益 ÷ 总投入。\n" +
        "## 敏感性与风险提示\n若收益下滑 30%，回收期延长至约 9 个月。\n").repeat(2);
    const c06Artifact = buildResultArtifact({
      outputKind: byId.C06.output.kind,
      title: "项目投资回报（ROI）分析报告",
      content: c06Content,
      artifactMime: byId.C06.output.artifactMime,
      schemaVersion: byId.C06.output.schemaVersion,
      rendererType: byId.C06.output.rendererType,
    });
    assert.equal(c06Artifact.type, "document");
    assert.equal(c06Artifact.mimeType, "text/markdown");
    validateComponentOutput(byId.C06, { kind: byId.C06.output.kind, content: c06Artifact.content });

    // C08 结构化异常清单
    const c08Content = {
      scenarios: [
        { scenario: "下单后断网中断", trigger: "客户端网络中断", impact: "订单状态不明", handling: "幂等重试 + 订单状态查询", priority: "高", category: "网络中断" },
        { scenario: "支付成功回调丢失", trigger: "第三方回调超时", impact: "已扣款未发货", handling: "主动对账补偿", priority: "高", category: "支付与资金" },
        { scenario: "并发超卖", trigger: "同库存并发下单", impact: "超卖", handling: "库存预占 + 乐观锁", priority: "高", category: "并发与一致性" },
      ],
      coverageSummary: "已覆盖网络中断、支付与资金、并发与一致性三类异常，仍存在第三方依赖异常与数据边界覆盖缺口。",
      openQuestions: ["支付失败是否需要自动退款？", "库存预占超时时长是多少？"],
    };
    const c08Artifact = buildResultArtifact({
      outputKind: byId.C08.output.kind,
      title: "业务异常与极端场景补全清单",
      content: c08Content,
      artifactMime: byId.C08.output.artifactMime,
      schemaVersion: byId.C08.output.schemaVersion,
      rendererType: byId.C08.output.rendererType,
    });
    assert.equal(c08Artifact.type, "table");
    assert.equal(c08Artifact.mimeType, "application/json");
    validateComponentOutput(byId.C08, { kind: byId.C08.output.kind, content: c08Content });
    // 缺必填属性必须拒绝
    assert.throws(
      () =>
        validateComponentOutput(byId.C08, {
          kind: "TABLE",
          content: { scenarios: [], coverageSummary: "已覆盖异常维度".repeat(40) },
        }),
      /缺失 schema 必填属性/,
    );

    // C10 模拟数据表
    const c10Content = {
      schema: [
        { field: "user_name", type: "string", description: "虚构姓名" },
        { field: "mobile", type: "string", description: "中间四位打码的手机号" },
        { field: "amount", type: "number", description: "订单金额（元）" },
      ],
      rows: [
        { user_name: "测试用户甲", mobile: "138****5678", amount: 199.5 },
        { user_name: "测试用户乙", mobile: "139****1234", amount: 88 },
      ],
      privacyNotes: "姓名全部为虚构值；手机号中间四位打码；不含任何真实个人身份信息，脱敏规则见本说明。",
      summary: "数据分布贴近电商订单场景，可用于联调与压测，严禁回流生产库。",
    };
    const c10Artifact = buildResultArtifact({
      outputKind: byId.C10.output.kind,
      title: "虚拟模拟测试数据",
      content: c10Content,
      artifactMime: byId.C10.output.artifactMime,
      schemaVersion: byId.C10.output.schemaVersion,
      rendererType: byId.C10.output.rendererType,
    });
    assert.equal(c10Artifact.type, "table");
    assert.equal(c10Artifact.mimeType, "application/json");
    validateComponentOutput(byId.C10, { kind: byId.C10.output.kind, content: c10Content });

    // C11 文档成果物（接口清单 + 代码 + 数据契约 + 注解）
    const c11Content =
      ("## 接口清单\n| 方法 | 路径 | 用途 | 鉴权要求 |\n| --- | --- | --- | --- |\n| POST | /api/user/register | 用户注册 | 否 |\n" +
        "## 接口实现代码\n```ts\n// 入参校验 + 统一错误码\n```\n" +
        "## 数据契约\n请求字段：mobile（字符串，必填）；响应字段：userId（字符串）。\n" +
        "## 说明书注解\n接口用途、参数含义与错误码含义说明。\n").repeat(2);
    const c11Artifact = buildResultArtifact({
      outputKind: byId.C11.output.kind,
      title: "后端数据接口设计与实现",
      content: c11Content,
      artifactMime: byId.C11.output.artifactMime,
      schemaVersion: byId.C11.output.schemaVersion,
      rendererType: byId.C11.output.rendererType,
    });
    assert.equal(c11Artifact.type, "document");
    assert.equal(c11Artifact.mimeType, "text/markdown");
    validateComponentOutput(byId.C11, { kind: byId.C11.output.kind, content: c11Artifact.content });

    // 输出类型不匹配必须拒绝
    assert.throws(
      () => validateComponentOutput(byId.C06, { kind: "TABLE", content: c06Content }),
      /与合同要求的输出类型/,
    );
  });

  test("7. 依据真实部署能力的激活裁决：四者均可激活；缺 STRUCTURED_OUTPUT 时 C08/C10 必须 BLOCKED", () => {
    for (const { componentId, contract } of BATCH_2B) {
      const r = evaluateActivationEligibility(contract, REAL_DEPLOYMENT_CAPABILITIES);
      assert.equal(r.eligible, true, `${componentId} 在真实部署能力下应可发布激活`);
      assert.deepEqual(r.missingCapabilities, [], `${componentId} 不得存在缺失能力`);
    }

    // 反例：仅 TEXT_GENERATION 时，C08/C10 缺 STRUCTURED_OUTPUT，必须保持不可激活（BLOCKED）
    const onlyText = ["TEXT_GENERATION"];
    for (const id of ["C06", "C11"]) {
      assert.equal(evaluateActivationEligibility(byId[id], onlyText).eligible, true, `${id} 仅需文本生成`);
    }
    for (const id of ["C08", "C10"]) {
      const r = evaluateActivationEligibility(byId[id], onlyText);
      assert.equal(r.eligible, false, `${id} 缺 STRUCTURED_OUTPUT 时不得激活`);
      assert.deepEqual(r.missingCapabilities, ["STRUCTURED_OUTPUT"], `${id} 缺失能力必须显式列出`);
    }
  });

  test("8. 逐组件业务分析字段完整（检查清单逐项有值，不得静默留空）", () => {
    const requiredText: Array<keyof (typeof analysisById)["C06"]> = [
      "businessPurpose",
      "inputMethod",
      "textRequirement",
      "fileRequirement",
      "artifactStructure",
      "failureHandling",
      "realDataBaseline",
      "capabilitySupport",
      "notes",
    ];
    for (const id of ["C06", "C08", "C10", "C11"] as const) {
      const a = analysisById[id];
      assert.equal(a.componentId, id);
      for (const f of requiredText) {
        const v = a[f];
        assert.ok(typeof v === "string" && v.trim().length > 0, `${id}.${f} 必须为非空业务说明`);
      }
      assert.equal(a.publishStatus, "DRAFT");
      assert.equal(a.activationStatus, "ELIGIBLE");
      assert.deepEqual(a.missingMaterials, [], `${id} 无资料缺口时必须为空数组`);
      assert.ok(a.estimatedTokens > 0, `${id} 必须有估算 Token`);
      assert.ok(a.outputKind === byId[id].output.kind, `${id} 分析 outputKind 必须与合同一致`);
      assert.ok(a.rendererType === byId[id].output.rendererType, `${id} 分析 rendererType 必须与合同一致`);
      assert.deepEqual(a.requiredCapabilities.slice().sort(), capsOf(byId[id]), `${id} 分析能力必须与合同一致`);
    }

    // 估算 Token 必须与目录 component_catalog.estimatedModelTokens 实测值一致
    assert.equal(analysisById.C06.estimatedTokens, 200);
    assert.equal(analysisById.C08.estimatedTokens, 150);
    assert.equal(analysisById.C10.estimatedTokens, 250);
    assert.equal(analysisById.C11.estimatedTokens, 80);
    for (const id of ["C06", "C08", "C10", "C11"] as const) {
      assert.equal(
        byId[id].billingPolicy.estimatedTokens,
        analysisById[id].estimatedTokens,
        `${id} billingPolicy.estimatedTokens 必须与分析/目录对齐`,
      );
    }
  });
});
