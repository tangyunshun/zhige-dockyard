/**
 * 组件能力盘点确定性与纯函数单元测试套件
 *
 * 核心保障：
 * 1. 同一输入 fixture 连续两次生成，Markdown 与 JSON 必须逐字节完全一致 (Byte-for-byte identical)；
 * 2. 纯内存执行，绝不读写真实数据库，绝不修改 docs/ 目录；
 * 3. 严格验证 OBSERVED / INFERRED / UNKNOWN 置信度三态标记；
 * 4. 严格验证动态特判与执行链发现（无固定 C07 特判与死行号）。
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  RawCatalogComponent,
  SourceCodeEvidence,
  analyzeAllComponents,
  renderCapabilityMatrixJson,
  renderCapabilityMatrixMarkdown,
  scanSourceCodeEvidence,
} from "../../../scripts/audit-component-capabilities";

test("组件能力盘点确定性与证据驱动分析套件", async (t) => {
  // 1. 同一 fixture 双次生成逐字节一致性测试 (Byte-for-byte Identical)
  await t.test("1. 同一 fixture 连续两次分析与渲染，输出逐字节完全一致", () => {
    const fixtureComponents: RawCatalogComponent[] = [
      {
        id: "C01",
        name: "招标文件智能解析",
        category: "BID_PREP",
        inputMode: "file",
        accept: ".pdf,.doc,.docx",
        contract: "PDF ➜ 偏离表",
        previewData: null,
        detail: null,
        isPublished: true,
        estimatedModelTokens: 1500,
      },
      {
        id: "C02",
        name: "商务技术偏离表生成",
        category: "BID_PREP",
        inputMode: "both",
        accept: ".pdf,.xlsx",
        contract: "招标文件 + 投标文件 ➜ 偏离表",
        previewData: null,
        detail: null,
        isPublished: true,
        estimatedModelTokens: 2000,
      },
      {
        id: "C07",
        name: "会议纪要自动转需求(PRD)",
        category: "REQ_DESIGN",
        inputMode: "both",
        accept: ".mp3,.m4a,.txt,.docx",
        contract: "会议录音/纪要 ➜ PRD 需求文档",
        previewData: null,
        detail: {
          executionProfile: {
            contractVersion: "v1.0",
            execution: {
              mode: "REAL_MODEL",
              promptTemplate: "请将以下会议纪要整理为 PRD：{{text}}",
            },
            input: {
              mode: "multiple",
            },
          },
        },
        isPublished: true,
        estimatedModelTokens: 3000,
      },
      {
        id: "C15",
        name: "需求完整性自检",
        category: "REQ_DESIGN",
        inputMode: "text",
        accept: null,
        contract: null,
        previewData: null,
        detail: null,
        isPublished: false,
        estimatedModelTokens: 800,
      },
    ];

    const mockCodeEvidence: SourceCodeEvidence = {
      specialCaseComponentIds: new Set(["C07"]),
      specialCaseLocations: new Map([["C07", "src/app/api/studio/route.ts [符号: PILOT_COMPONENT_ID 特判分支]"]]),
      realExecutionComponentIds: new Set(["C07"]),
      realExecutionLocations: new Map([["C07", "src/app/api/studio/route.ts [执行链路: assertPilotContractOrThrow -> resolveModelExecutionPlan]"]]),
      knownFileParsers: new Map([
        ["TEXT_AND_FILE_EXTRACTOR", "src/app/api/studio/route.ts [符号: extractTextFromBufferWithTimeout]"],
      ]),
    };

    const benchmarkTime = "2026-09-20T10:00:00.000Z";

    // 第一次分析与渲染
    const summary1 = analyzeAllComponents(fixtureComponents, mockCodeEvidence, benchmarkTime);
    const json1 = renderCapabilityMatrixJson(summary1);
    const md1 = renderCapabilityMatrixMarkdown(summary1);

    // 第二次分析与渲染（乱序传入组件列表，验证内部稳定排序）
    const shuffled = [fixtureComponents[2], fixtureComponents[0], fixtureComponents[3], fixtureComponents[1]];
    const summary2 = analyzeAllComponents(shuffled, mockCodeEvidence, benchmarkTime);
    const json2 = renderCapabilityMatrixJson(summary2);
    const md2 = renderCapabilityMatrixMarkdown(summary2);

    // 严格逐字节比较
    const bufJson1 = Buffer.from(json1, "utf-8");
    const bufJson2 = Buffer.from(json2, "utf-8");
    assert.equal(
      Buffer.compare(bufJson1, bufJson2),
      0,
      "连续两次生成的 JSON 报告必须逐字节完全一致，无任何时间戳漂移或乱序 diff！"
    );

    const bufMd1 = Buffer.from(md1, "utf-8");
    const bufMd2 = Buffer.from(md2, "utf-8");
    assert.equal(
      Buffer.compare(bufMd1, bufMd2),
      0,
      "连续两次生成的 Markdown 报告必须逐字节完全一致！"
    );
  });

  // 2. 源码动态证据扫描测试（无硬编码 C07 特判与死行号）
  await t.test("2. 源码证据扫描动态提取特判符号与执行链", () => {
    const mockFiles = new Map<string, string>();
    mockFiles.set(
      "src/app/api/studio/route.ts",
      `
      if (comp.id === "CUSTOM_PILOT_X") {
        doSomething();
      }
      export const PILOT_COMPONENT_ID = process.env.PILOT_COMPONENT_ID || "C99";
      async function parse() {
        return extractTextFromBufferWithTimeout(buf, name, "", 60000);
      }
      `
    );

    const evidence = scanSourceCodeEvidence(mockFiles);

    // 动态提取特判组件 ID，而不是写死 C07
    assert.ok(evidence.specialCaseComponentIds.has("CUSTOM_PILOT_X"));
    assert.ok(evidence.specialCaseComponentIds.has("C99"));
    assert.ok(evidence.knownFileParsers.has("TEXT_AND_FILE_EXTRACTOR"));
    // 检查证据描述中不包含死行号，只包含文件路径与符号特征
    const loc = evidence.specialCaseLocations.get("CUSTOM_PILOT_X");
    assert.ok(loc && !loc.includes("LineNumber"));
    assert.ok(loc && loc.includes("条件分支: comp.id === \"CUSTOM_PILOT_X\""));
  });

  // 3. 置信度三态标记与原型推断判定
  await t.test("3. 置信度三态标记 (OBSERVED / INFERRED / UNKNOWN) 与原型推断准确性", () => {
    const components: RawCatalogComponent[] = [
      {
        id: "C01",
        name: "纯文本组件",
        category: "DEV",
        inputMode: "text",
        accept: null,
        contract: null,
        previewData: null,
        detail: null,
        isPublished: true,
        estimatedModelTokens: 100,
      },
      {
        id: "C02",
        name: "偏离表提取",
        category: "DEV",
        inputMode: "file",
        accept: ".pdf",
        contract: "偏离表",
        previewData: null,
        detail: null,
        isPublished: true,
        estimatedModelTokens: 100,
      },
      {
        id: "C03",
        name: "输入未声明组件",
        category: "DEV",
        inputMode: null, // 输入模式缺失
        accept: null,
        contract: null,
        previewData: null,
        detail: null,
        isPublished: true,
        estimatedModelTokens: 100,
      },
    ];

    const emptyEvidence: SourceCodeEvidence = {
      specialCaseComponentIds: new Set(),
      specialCaseLocations: new Map(),
      realExecutionComponentIds: new Set(),
      realExecutionLocations: new Map(),
      knownFileParsers: new Map(),
    };

    const summary = analyzeAllComponents(components, emptyEvidence, "2026-09-20T00:00:00Z");

    // C01: 纯文本输入已观测
    assert.equal(summary.items[0].observedInputPrototype, "TEXT_ONLY");
    assert.equal(summary.items[0].inputStatus, "OBSERVED");

    // C02: 根据偏离表推断演进原型为 TABLE_OR_SCORE_OUTPUT
    assert.equal(summary.items[1].observedInputPrototype, "SINGLE_FILE");
    assert.equal(summary.items[1].recommendedPrototype, "TABLE_OR_SCORE_OUTPUT");

    // C03: 输入模式为空，必须保留 UNKNOWN
    assert.equal(summary.items[2].observedInputPrototype, "UNKNOWN");
    assert.equal(summary.items[2].inputStatus, "UNKNOWN");
  });

  // 4. 守护测试：构造没有特定历史组件ID的 fixture，确认报告绝不自动凭空出现该ID
  await t.test("4. 构造无特定历史组件的 fixture，确认报告绝不自动出现该历史ID", () => {
    const fixtureWithoutHistoricalId: RawCatalogComponent[] = [
      {
        id: "X01",
        name: "组件一",
        category: "DEV",
        inputMode: "text",
        accept: null,
        contract: null,
        previewData: null,
        detail: null,
        isPublished: true,
        estimatedModelTokens: 100,
      },
      {
        id: "X02",
        name: "组件二",
        category: "DEV",
        inputMode: "file",
        accept: ".txt",
        contract: null,
        previewData: null,
        detail: null,
        isPublished: true,
        estimatedModelTokens: 100,
      },
    ];

    const emptyEvidence: SourceCodeEvidence = {
      specialCaseComponentIds: new Set(),
      specialCaseLocations: new Map(),
      realExecutionComponentIds: new Set(),
      realExecutionLocations: new Map(),
      knownFileParsers: new Map(),
    };

    const summary = analyzeAllComponents(fixtureWithoutHistoricalId, emptyEvidence, "2026-09-20T00:00:00Z");
    const jsonStr = renderCapabilityMatrixJson(summary);
    const mdStr = renderCapabilityMatrixMarkdown(summary);

    // 确认结果中绝无凭空出现的历史组件 ID
    assert.equal(summary.items.some((it) => it.componentId === "C07"), false);
    assert.equal(jsonStr.includes('"C07"'), false);
    assert.equal(mdStr.includes("**C07**"), false);
  });

  // 5. 守护测试：构造两个不同组件 ID 的真实执行证据，确认扫描器能动态识别
  await t.test("5. 构造两个不同组件 ID 的真实执行证据，确认扫描器能动态识别", () => {
    const mockFiles = new Map<string, string>();
    mockFiles.set(
      "src/app/api/studio/route.ts",
      `
      if (comp.id === "ALPHA_01") {
        const plan = resolveModelExecutionPlan(comp);
        const adapter = createModelAdapter(plan);
      }
      if (comp.id === "BETA_02") {
        const plan = resolveModelExecutionPlan(comp);
        const adapter = createModelAdapter(plan);
      }
      `
    );

    const evidence = scanSourceCodeEvidence(mockFiles);
    assert.ok(evidence.specialCaseComponentIds.has("ALPHA_01"));
    assert.ok(evidence.specialCaseComponentIds.has("BETA_02"));
    assert.ok(evidence.realExecutionComponentIds.has("ALPHA_01"));
    assert.ok(evidence.realExecutionComponentIds.has("BETA_02"));
    assert.equal(evidence.realExecutionComponentIds.has("C07"), false);
  });

  // 6. 守护测试：构造无法建立组件 ID 映射的执行链，确认结果必须为 UNKNOWN
  await t.test("6. 构造无法建立组件 ID 映射的执行链，确认结果为 UNKNOWN", () => {
    const mockFiles = new Map<string, string>();
    mockFiles.set(
      "src/app/api/studio/route.ts",
      `
      // 通用执行函数，未与任何具体组件 ID 建立映射
      function executeGenericModel(context: unknown) {
        return createModelAdapter(resolveModelExecutionPlan(context));
      }
      `
    );

    const evidence = scanSourceCodeEvidence(mockFiles);
    // 无法从源码推断出任何具体组件 ID 的真实执行链
    assert.equal(evidence.realExecutionComponentIds.size, 0);

    const componentWithoutProfile: RawCatalogComponent = {
      id: "GAMMA_03",
      name: "无合同组件",
      category: "DEV",
      inputMode: "text",
      accept: null,
      contract: null,
      previewData: null,
      detail: null, // 缺少 executionProfile
      isPublished: true,
      estimatedModelTokens: 100,
    };

    const summary = analyzeAllComponents([componentWithoutProfile], evidence, "2026-09-20T00:00:00Z");
    const item = summary.items[0];
    assert.equal(item.hasRealExecutionChain, false);
    // 必须标记为 UNKNOWN，严禁断言为“模拟执行”或 INFERRED
    assert.equal(item.executionChainStatus, "UNKNOWN");
    assert.ok(item.executionChainEvidence.includes("缺失证据"));
  });

  // 7. 守护测试：对 audit-component-capabilities.ts 源码静态扫描
  await t.test("7. 对 audit-component-capabilities.ts 源码静态扫描，禁止字面量 C07 fallback、固定厂商名称和固定 route.ts 行号", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");

    const auditScriptPath = path.resolve(process.cwd(), "scripts/audit-component-capabilities.ts");
    const code = await fs.readFile(auditScriptPath, "utf-8");

    // 1. 禁止字面量 C07 回退
    assert.equal(
      code.includes('"C07"') || code.includes("'C07'"),
      false,
      "audit-component-capabilities.ts 源码中严禁包含任何字面量 'C07'！"
    );

    // 2. 禁止固定 route.ts 行号
    const routeLineRegex = /route\.ts:[0-9]+/;
    assert.equal(
      routeLineRegex.test(code),
      false,
      "audit-component-capabilities.ts 源码中严禁写死固定行号 route.ts:xxx！"
    );

    // 3. 禁止模型厂商硬编码名单
    const vendorRegex = /(?:MagicAI|DeepSeek|OpenAI|智谱)/i;
    assert.equal(
      vendorRegex.test(code),
      false,
      "audit-component-capabilities.ts 源码中严禁硬编码厂商名称！"
    );
  });
});
